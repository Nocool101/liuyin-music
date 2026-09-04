import { initSetting } from '@/core/common'
import registerPlaybackService from '@/plugins/player/service'
import initTheme from './theme'
import initI18n from './i18n'
import initUserApi from './userApi'
import initPlayer from './player'
import dataInit from './dataInit'
import initCommonState from './common'
import { initDeeplink } from './deeplink'
import { requestFirstLaunchPermissions } from './permissions'
import { setApiSource } from '@/core/apiSource'
import commonActions from '@/store/common/action'
import settingState from '@/store/setting/state'
import { bootLog } from '@/utils/bootLog'

let isFirstPush = true
const handlePushedHomeScreen = async() => {
  if (isFirstPush) {
    isFirstPush = false
    void initDeeplink()
    // 首次启动的权限引导：已同意协议（老用户）直接请求；
    // 新用户等待同意协议后在 PactModal 里触发
    if (settingState.setting['common.isAgreePact']) void requestFirstLaunchPermissions()
  }
}

let isInited = false
export default async() => {
  if (isInited) return handlePushedHomeScreen
  bootLog('Initing...')
  commonActions.setFontSize(global.lx.fontSize)
  bootLog('Font size changed.')
  const setting = await initSetting()
  bootLog('Setting inited.')
  // console.log(setting)

  await initTheme(setting)
  bootLog('Theme inited.')
  await initI18n(setting)
  bootLog('I18n inited.')

  await initUserApi(setting)
  bootLog('User Api inited.')

  setApiSource(setting['common.apiSource'])
  bootLog('Api inited.')

  registerPlaybackService()
  bootLog('Playback Service Registered.')
  await initPlayer(setting)
  bootLog('Player inited.')
  await dataInit(setting)
  bootLog('Data inited.')
  await initCommonState(setting)
  bootLog('Common State inited.')

  // syncSetting()

  isInited ||= true

  return handlePushedHomeScreen
}
