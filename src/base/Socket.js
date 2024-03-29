import wsUrl from '../common/ws-url'
import msgStruct from '../common/msg-struct'
import {
  generatePacket
} from '../util/packet'
import {
  bytes2str
} from '../util/convert'

const websocketfactory = require('@system.websocketfactory')

export default class Socket {
  constructor(roomid) {
    this.roomid = roomid
    /* eslint-disable */
    this._docker = websocketfactory.create({
      url: wsUrl,
      header: {
        'content-type': 'application/json'
      },
      protocols: ['protocol']
    })
    this._methods = []
  }

  init() {
    console.log(`新的socket正在初始化...`)
    this._docker.binaryType = 'arraybuffer'
    this._docker.onopen = event => {
      const join = this._joinRoom(this.roomid)
      this._docker.send({
        data: join.buffer,
        success(e) {
          // console.log(e)
        }
      })
      this._sendBeat()
    }

    this._docker.onmessage = event => {
      const dataView = new DataView(event.data)
      let packetLen, headerLen
      const result = []
      for (let offset = 0; offset < dataView.byteLength;) {
        const data = {}
        packetLen = dataView.getUint32(offset)
        headerLen = dataView.getUint16(offset + 4)

        msgStruct.forEach(item => {
          if (item.bytes === 4) {
            data[item.key] = dataView.getUint32(offset + item.offset)
          } else if (item.bytes === 2) {
            data[item.key] = dataView.getUint16(offset + item.offset)
          }
        })

        if (data.op && data.op === 5) {
          data.body = []

          const recData = []
          for (let i = offset + headerLen; i < offset + packetLen; i++) {
            recData.push(dataView.getUint8(i))
          }
          try {
            data.body = []
            const body = JSON.parse(bytes2str(recData))
            if (body.cmd === 'DANMU_MSG') {
              console.log(body.info[2][1], ':', body.info[1])
              this._call({
                name: body.info[2][1],
                text: body.info[1]
              })
            }
            data.body.push(body)
          } catch (e) {
            console.log(e)
          }
        }
        result.push(data)
        offset += packetLen
      }
      // console.warn(`该条message携带${result.length}条弹幕`, result)
    }

    this._docker.onclose = event => {
      console.log(`旧的socket已经关闭...`, event)
    }

    this._docker.onerror = event => {
      console.log(`如果关闭时触发error，请忽略`)
      console.log(`发生错误`, event)
    }
  }

  addMethods(fns) {
    this._methods = fns
  }

  close() {
    // 清除定时脚本
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
    this._docker.close({
      code: 1000,
      reason: 'close as normal',
      success: function () {
        console.log(`close success`)
      },
      fail: function () {
        console.log(`close fail`)
      }
    })
  }

  /**
   * 执行函数
   */
  _call(...args) {
    for (let i = 0, l = this._methods.length; i < l; i++) {
      const fn = this._methods[i]
      if (typeof fn !== 'function') continue
      fn.apply(null, args)
    }
  }

  /**
   * 发送加入房价包
   */
  _joinRoom(rid = 282712, uid = 19176530) {
    const packet = JSON.stringify({
      uid,
      roomid: rid
    })
    return generatePacket(7, packet)
  }

  /**
   * 发送心跳包，表明连接激活
   */
  _sendBeat() {
    this._timer = setInterval(() => {
      this._docker.send({
        data: generatePacket().buffer, // 快应用这里可以传arraybuffer或字符串
        success(e) {
          // console.log(e)
        }
      })
    }, 30 * 1000)
  }
}