import { createList, setTempList } from '@/core/list'
import { playListById } from '@/core/player/player'
import { getListDetail, getListDetailAll } from '@/core/songlist'
import { LIST_IDS } from '@/config/constant'
import listState from '@/store/list/state'
import syncSourceList from '@/core/syncSourceList'
import { confirmDialog, toMD5, toast } from '@/utils/tools'
import { type Source } from '@/store/songlist/state'

const getListId = (id: string, source: LX.OnlineSource) => `${source}__${id}`

export const handlePlay = async(id: string, source: Source, list?: LX.Music.MusicInfoOnline[], index = 0) => {
  const listId = getListId(id, source)
  // 先取全量列表写入临时列表（播放中途不再替换，避免"下一首"跳到别的歌），
  // 播放目标按歌曲 ID 定位（可见列表与全量列表内容可能不一致，索引会错位）
  const fullList = await getListDetailAll(source, id).catch(() => null)
  const playListData = fullList?.length ? fullList : (list ?? (await getListDetail(id, source, 1)).list) ?? []
  if (!playListData.length) return
  const clicked = list?.length ? list[index] : playListData[index]
  const clickedId = clicked?.id ?? playListData[0]?.id
  if (!clickedId) return
  // 被点击的歌若不在队列中则插到头部，保证按 ID 播放必能命中
  const queue = clicked && !playListData.some(s => s.id == clickedId) ? [clicked, ...playListData] : playListData
  await setTempList(listId, [...queue])
  void playListById(LIST_IDS.TEMP, clickedId)
}

export const handleCollect = async(id: string, source: Source, name: string) => {
  const listId = getListId(id, source)

  const targetList = listState.userList.find(l => l.sourceListId == listId)
  if (targetList) {
    const confirm = await confirmDialog({
      message: global.i18n.t('duplicate_list_tip', { name: targetList.name }),
      cancelButtonText: global.i18n.t('list_import_part_button_cancel'),
      confirmButtonText: global.i18n.t('confirm_button_text'),
    })
    if (!confirm) return
    void syncSourceList(targetList)
    return
  }

  const list = await getListDetailAll(source, id)
  await createList({
    name,
    id: `${source}_${toMD5(listId)}`,
    list,
    source,
    sourceListId: id,
  })
  toast(global.i18n.t('collect_success'))
}
