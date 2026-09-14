import { getMusicUrl } from '@/core/music'
import settingState from '@/store/setting/state'
import { updateSetting } from '@/core/common'
import { toast, formatMusicName } from '@/utils/tools'
import { log } from '@/utils/log'
import {
  mkdir,
  readDir,
  existsFile,
  moveFile,
  unlink,
  downloadFile,
  stopDownload,
  temporaryDirectoryPath,
  externalStorageDirectoryPath,
} from '@/utils/fs'

export const DEFAULT_DOWNLOAD_SAVE_PATH = `${externalStorageDirectoryPath}/Android/data/cn.lycool.app/files/Music`

export const DOWNLOAD_QUALITYS: LX.Quality[] = ['128k', '320k', 'flac']

const getExt = (quality: LX.Quality): string => {
  switch (quality) {
    case 'flac':
    case 'flac24bit':
    case 'ape':
    case 'wav':
      return 'flac'
    default:
      return 'mp3'
  }
}

const runTask = (musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality, saveDir: string): Promise<void> => {
  let jobId = 0
  const name = formatMusicName(settingState.setting['download.fileName'], musicInfo.name, musicInfo.singer)
  const ext = getExt(quality)
  const isContentUri = saveDir.startsWith('content://')

  const buildTargetPath = async(): Promise<string> => {
    if (isContentUri) {
      const files = await readDir(saveDir)
      const names = new Set(files.map(f => f.name ?? ''))
      let num = 0
      let path = `${saveDir}/${name}.${ext}`
      while (names.has(`${name}${num ? `(${num})` : ''}.${ext}`)) {
        num++
        path = `${saveDir}/${name}(${num}).${ext}`
      }
      return path
    }
    let path = `${saveDir}/${name}.${ext}`
    let num = 1
    while (await existsFile(path)) {
      path = `${saveDir}/${name}(${num++}).${ext}`
    }
    return path
  }

  return (async() => {
    const url = await getMusicUrl({ musicInfo, quality, isRefresh: false })
    log.info('download url resolved:', musicInfo.name, url.slice(0, 80))
    const tmpPath = `${temporaryDirectoryPath}/download_tmp_${Date.now()}.${ext}`
    try {
      const targetPath = await buildTargetPath()
      const task = downloadFile(url, tmpPath)
      jobId = task.jobId
      const result = await task.promise
      log.info('download finished:', name, 'status:', result.statusCode, 'bytes:', result.bytesWritten)
      if (result.statusCode !== 200) throw new Error(`Download failed with status ${result.statusCode}`)
      await moveFile(tmpPath, targetPath)
      toast(global.i18n.t('download_success_tip', { name }), 'long')
    } catch (err) {
      void unlink(tmpPath).catch(() => {})
      log.warn('download music failed:', musicInfo.name, err?.message ?? String(err))
      toast(global.i18n.t('download_failed_tip', { name }), 'long')
    } finally {
      if (jobId) stopDownload(jobId)
    }
  })()
}

export const downloadMusics = async(musicInfos: LX.Music.MusicInfoOnline[], quality: LX.Quality, saveDir: string): Promise<void> => {
  if (!musicInfos.length) return
  log.info('downloadMusics start:', musicInfos.length, 'songs, quality:', quality, 'dir:', saveDir)
  void updateSetting({ 'download.savePath': saveDir, 'download.quality': quality })
  if (!saveDir.startsWith('content://')) {
    try {
      await mkdir(saveDir)
    } catch {}
  }
  toast(global.i18n.t('download_start_tip', { num: musicInfos.length }), 'short')
  for (const musicInfo of musicInfos) {
    await runTask(musicInfo, quality, saveDir)
  }
}
