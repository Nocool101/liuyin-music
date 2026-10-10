import { playListById } from '@/core/player/player'
import { useMemo, useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { FlatList, View, type NativeScrollEvent, type NativeSyntheticEvent, type FlatListProps, type LayoutChangeEvent } from 'react-native'

import listState from '@/store/list/state'
import playerState from '@/store/player/state'
import { getListPosition, getListPrevSelectId, saveListPosition } from '@/utils/data'
// import { useMusicList } from '@/store/list/hook'
import { getListMusics, setActiveList, updateListMusicPosition } from '@/core/list'
import ListItem, { ITEM_HEIGHT } from './ListItem'
import { createStyle, getRowInfo } from '@/utils/tools'
import { usePlayInfo, usePlayMusicInfo } from '@/store/player/hook'
import type { Position } from './ListMenu'
import type { SelectMode } from './MultipleModeBar'
import { useActiveListId } from '@/store/list/hook'
import { useSettingValue } from '@/store/setting/hook'

type FlatListType = FlatListProps<LX.Music.MusicInfo>

export interface ListProps {
  onShowMenu: (musicInfo: LX.Music.MusicInfo, index: number, position: Position) => void
  onSelectAll: (isAll: boolean) => void
}
export interface ListType {
  setIsMultiSelectMode: (isMultiSelectMode: boolean) => void
  setSelectMode: (mode: SelectMode) => void
  selectAll: (isAll: boolean) => void
  getSelectedList: () => LX.List.ListMusics
  scrollToInfo: (info: LX.Music.MusicInfo) => void
  scrollToTop: () => void
  scrollToCurrent: () => boolean
}

const usePlayIndex = () => {
  const activeListId = useActiveListId()
  const playMusicInfo = usePlayMusicInfo()
  const playInfo = usePlayInfo()

  const playIndex = useMemo(() => {
    return playMusicInfo.listId == activeListId ? playInfo.playIndex : -1
  }, [activeListId, playInfo.playIndex, playMusicInfo.listId])

  return playIndex
}


const List = forwardRef<ListType, ListProps>(({ onShowMenu, onSelectAll }, ref) => {
  // const t = useI18n()
  const flatListRef = useRef<FlatList>(null)
  const [currentList, setList] = useState<LX.List.ListMusics>([])
  const currentListRef = useRef<LX.List.ListMusics>([])
  const listFirstScrollRef = useRef(false)
  const isMultiSelectModeRef = useRef(false)
  const selectModeRef = useRef<SelectMode>('single')
  const prevSelectIndexRef = useRef(-1)
  const [selectedList, setSelectedList] = useState<LX.List.ListMusics>([])
  const selectedListRef = useRef<LX.List.ListMusics>([])
  const currentListIdRef = useRef('')
  const waitJumpListPositionRef = useRef(false)
  const isUpdateingListRef = useRef(true)
  const rowInfo = useRef(getRowInfo())
  const isShowAlbumName = useSettingValue('list.isShowAlbumName')
  const isShowInterval = useSettingValue('list.isShowInterval')
  // console.log('render music list')

  // ---- 拖拽排序状态 ----
  // 拖动中的歌曲用页面坐标浮层渲染（不随列表滚动），彻底避免滚动与位移的帧错位抖动
  const [overlay, setOverlay] = useState<{ item: LX.Music.MusicInfo, x: number, y: number } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const isDraggingRef = useRef(false)
  const dragIndexRef = useRef(-1)
  const dragFromIndexRef = useRef(-1)
  const dragIdRef = useRef<string | null>(null)
  const dragDeltaRef = useRef({ x: 0, y: 0 })
  const grantRowPosRef = useRef({ x: 0, y: 0 })
  const grantScrollOffsetRef = useRef(0)
  const listLayoutRef = useRef({ width: 0, height: 0 })
  const listPageRef = useRef({ x: 0, y: 0, width: 0, height: 0 })
  const scrollOffsetRef = useRef(0)
  const colWidthRef = useRef(0)
  const autoScrollDirRef = useRef(0)
  const autoScrollRafRef = useRef<number | null>(null)

  const setListSafe = (list: LX.List.ListMusics) => {
    currentListRef.current = list
    setList(list)
  }

  const stopAutoScroll = () => {
    autoScrollDirRef.current = 0
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current)
      autoScrollRafRef.current = null
    }
  }

  // 基于手势增量(dx/dy)计算目标索引并实时重排，同时处理上下边缘自动滚动。
  // 全部使用与样式一致的 DP 单位（事件坐标/手势增量/ITEM_HEIGHT/contentOffset 均为 DP），
  // 不依赖 measure——部分视图上 measure 回调不可靠（实测回调参数为 undefined）。
  const updateDragPosition = (dx: number, dy: number) => {
    if (!isDraggingRef.current) return
    // 列表已被外部变更（如远程同步覆盖）导致拖拽项丢失时，放弃本次拖拽且不持久化
    const curList = currentListRef.current
    if (dragIndexRef.current < 0 || dragIndexRef.current >= curList.length || curList[dragIndexRef.current]?.id != dragIdRef.current) {
      stopAutoScroll()
      isDraggingRef.current = false
      dragIndexRef.current = -1
      dragFromIndexRef.current = -1
      dragIdRef.current = null
      setDragId(null)
      setOverlay(null)
      return
    }
    // 自动滚动期间内容在手指下移动，滚动量计入有效位移，换行判断才准确
    const effectiveDy = dy + (scrollOffsetRef.current - grantScrollOffsetRef.current)
    const rowNum = rowInfo.current.rowNum ?? 1
    const from = dragFromIndexRef.current
    const row = Math.max(0, Math.floor(from / rowNum) + Math.round(effectiveDy / ITEM_HEIGHT))
    const col = Math.max(0, Math.min(rowNum - 1, (from % rowNum) + Math.round(dx / colWidthRef.current)))
    const target = Math.max(0, Math.min(curList.length - 1, row * rowNum + col))
    if (target != dragIndexRef.current) {
      const list = [...curList]
      const [moved] = list.splice(dragIndexRef.current, 1)
      list.splice(target, 0, moved)
      setListSafe(list)
      dragIndexRef.current = target
      setOverlay({ item: moved, x: grantRowPosRef.current.x + dx, y: grantRowPosRef.current.y + dy })
    } else {
      setOverlay({ item: curList[dragIndexRef.current], x: grantRowPosRef.current.x + dx, y: grantRowPosRef.current.y + dy })
    }
    // 自动滚动：手指相对列表页面矩形的位置（列表页面位置不随内容滚动变化）
    const fingerRelY = grantRowPosRef.current.y + dy - listPageRef.current.y
    const edge = 64
    autoScrollDirRef.current = fingerRelY < edge ? -1 : fingerRelY > listPageRef.current.height - edge ? 1 : 0
    if (autoScrollDirRef.current && autoScrollRafRef.current == null) {
      autoScrollRafRef.current = requestAnimationFrame(autoScrollTick)
    }
  }
  const autoScrollTick = () => {
    autoScrollRafRef.current = null
    if (!isDraggingRef.current || !autoScrollDirRef.current) return
    const offset = Math.max(0, scrollOffsetRef.current + autoScrollDirRef.current * 10)
    scrollOffsetRef.current = offset
    flatListRef.current?.scrollToOffset({ offset, animated: false })
    updateDragPosition(dragDeltaRef.current.x, dragDeltaRef.current.y)
    if (autoScrollDirRef.current && isDraggingRef.current && autoScrollRafRef.current == null) {
      autoScrollRafRef.current = requestAnimationFrame(autoScrollTick)
    }
  }

  // 长按歌曲即开始拖拽（无需 measure：用事件自带的行内偏移推算行的页面坐标）
  const handleDragStart = (index: number, pageX: number, pageY: number, locX: number, locY: number) => {
    if (isMultiSelectModeRef.current) return
    if (index < 0 || index >= currentListRef.current.length) return
    const rowNum = rowInfo.current.rowNum ?? 1
    const slotY = Math.floor(index / rowNum) * ITEM_HEIGHT
    // 行的页面坐标 = 手指页面坐标 - 手指在行内偏移；列表页面 Y = 行页面 Y - 行内容位置 + 滚动偏移（均为 DP）
    listPageRef.current = {
      x: 0,
      y: (pageY - locY) - slotY + scrollOffsetRef.current,
      width: listLayoutRef.current.width,
      height: listLayoutRef.current.height,
    }
    colWidthRef.current = listLayoutRef.current.width / rowNum
    grantRowPosRef.current = { x: pageX - locX, y: pageY - locY }
    grantScrollOffsetRef.current = scrollOffsetRef.current
    dragDeltaRef.current = { x: 0, y: 0 }
    dragIndexRef.current = index
    dragFromIndexRef.current = index
    dragIdRef.current = currentListRef.current[index]?.id ?? null
    isDraggingRef.current = true
    setDragId(dragIdRef.current)
    setOverlay({ item: currentListRef.current[index], x: grantRowPosRef.current.x, y: grantRowPosRef.current.y })
  }
  const handleDragMove = (dx: number, dy: number) => {
    dragDeltaRef.current = { x: dx, y: dy }
    if (!isDraggingRef.current) return
    updateDragPosition(dx, dy)
  }
  const handleDragEnd = () => {
    if (!isDraggingRef.current) return
    stopAutoScroll()
    const index = dragIndexRef.current
    const fromIndex = dragFromIndexRef.current
    const id = dragIdRef.current
    isDraggingRef.current = false
    dragIndexRef.current = -1
    dragFromIndexRef.current = -1
    dragIdRef.current = null
    setDragId(null)
    // 松手时把列表滚动到浮层所在位置，歌曲原地落位不跳变
    const rowNum = rowInfo.current.rowNum ?? 1
    const slotY = Math.floor(index / rowNum) * ITEM_HEIGHT
    const contentHeight = Math.ceil(currentListRef.current.length / rowNum) * ITEM_HEIGHT
    const maxScroll = Math.max(0, contentHeight - listLayoutRef.current.height)
    const targetScroll = Math.max(0, Math.min(maxScroll, listPageRef.current.y + slotY - grantRowPosRef.current.y - dragDeltaRef.current.y))
    const scrollDelta = targetScroll - scrollOffsetRef.current
    if (Math.abs(scrollDelta) > 0.5) {
      scrollOffsetRef.current = targetScroll
      // 小偏差动画滑过去（视觉连续）；大距离瞬移（避免长距离飞入）
      flatListRef.current?.scrollToOffset({ offset: targetScroll, animated: Math.abs(scrollDelta) < 240 })
    }
    setOverlay(null)
    // 位置有变化才持久化（移除后插入到目标位置，等价于单曲移动）
    if (id && index != fromIndex) void updateListMusicPosition(listState.activeListId, index, [id])
  }

  const handleListLayout = (e: LayoutChangeEvent) => {
    listLayoutRef.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }
  }

  useImperativeHandle(ref, () => ({
    setIsMultiSelectMode(isMultiSelectMode) {
      isMultiSelectModeRef.current = isMultiSelectMode
      if (!isMultiSelectMode) {
        prevSelectIndexRef.current = -1
        handleUpdateSelectedList([])
      }
    },
    setSelectMode(mode) {
      selectModeRef.current = mode
    },
    selectAll(isAll) {
      let list: LX.List.ListMusics
      if (isAll) {
        list = [...currentList]
      } else {
        list = []
      }
      selectedListRef.current = list
      setSelectedList(list)
    },
    getSelectedList() {
      return selectedListRef.current
    },
    scrollToInfo(info) {
      void getListMusics(listState.activeListId).then((list) => {
        const index = list.findIndex(m => m.id == info.id)
        if (index < 0) return
        flatListRef.current?.scrollToIndex({ index: Math.floor(index / (rowInfo.current.rowNum ?? 1)), viewPosition: 0.3, animated: true })
      })
    },
    scrollToTop() {
      flatListRef.current?.scrollToOffset({
        offset: 0,
        animated: true,
      })
    },
    // 滚动定位到当前播放歌曲；当前播放的不是这个列表时先切换列表。返回是否有歌曲在播放
    scrollToCurrent() {
      const listId = playerState.playMusicInfo.listId
      if (!listId) return false
      if (listId != listState.activeListId) {
        setActiveList(listId)
        if (currentListIdRef.current != listId) waitJumpListPositionRef.current = true
        return true
      }
      if (playerState.playInfo.playIndex > -1) {
        if (isUpdateingListRef.current) waitJumpListPositionRef.current = true
        else {
          try {
            flatListRef.current?.scrollToIndex({ index: Math.floor(playerState.playInfo.playIndex / (rowInfo.current.rowNum ?? 1)), viewPosition: 0.3, animated: true })
          } catch {}
        }
      }
      return true
    },
  }))

  useEffect(() => {
    const updateList = (id: string) => {
      if (currentListIdRef.current == id) return
      isUpdateingListRef.current = true
      setListSafe([])
      currentListIdRef.current = id
      void Promise.all([getListMusics(id), getListPosition(id)]).then(([list, position]) => {
        requestAnimationFrame(() => {
          if (currentListIdRef.current != id) return
          selectedListRef.current = []
          setSelectedList([])
          setListSafe([...list])
          requestAnimationFrame(() => {
            isUpdateingListRef.current = false
            listFirstScrollRef.current = true
            if (waitJumpListPositionRef.current) {
              waitJumpListPositionRef.current = false
              if (playerState.playMusicInfo.listId == id && playerState.playInfo.playIndex > -1) {
                try {
                  flatListRef.current?.scrollToIndex({ index: Math.floor(playerState.playInfo.playIndex / (rowInfo.current.rowNum ?? 1)), viewPosition: 0.3, animated: false })
                  return
                } catch {}
              }
            }
            flatListRef.current?.scrollToOffset({ offset: position, animated: false })
          })
        })
      })
    }
    const handleChange = (ids: string[]) => {
      if (!ids.includes(listState.activeListId)) return
      const id = listState.activeListId
      void getListMusics(id).then((list) => {
        if (currentListIdRef.current != id) return
        selectedListRef.current = []
        setSelectedList([])
        setListSafe([...list])
      })
    }

    const handleJumpPosition = () => {
      requestAnimationFrame(() => {
        const listId = playerState.playMusicInfo.listId
        if (!listId) return
        if (listId != listState.activeListId) {
          setActiveList(listId)
          if (currentListIdRef.current != listId) waitJumpListPositionRef.current = true
        } else if (playerState.playInfo.playIndex > -1) {
          if (isUpdateingListRef.current) waitJumpListPositionRef.current = true
          else {
            try {
              flatListRef.current?.scrollToIndex({ index: Math.floor(playerState.playInfo.playIndex / (rowInfo.current.rowNum ?? 1)), viewPosition: 0.3, animated: true })
            } catch {}
          }
        }
      })
    }
    if (global.lx.jumpMyListPosition) {
      global.lx.jumpMyListPosition = false
      if (playerState.playMusicInfo.listId) {
        waitJumpListPositionRef.current = true
        updateList(playerState.playMusicInfo.listId)
      } else void getListPrevSelectId().then(updateList)
    } else void getListPrevSelectId().then(updateList)

    global.state_event.on('mylistToggled', updateList)
    global.app_event.on('myListMusicUpdate', handleChange)
    global.app_event.on('jumpListPosition', handleJumpPosition)

    return () => {
      stopAutoScroll()
      global.state_event.off('mylistToggled', updateList)
      global.app_event.off('myListMusicUpdate', handleChange)
      global.app_event.off('jumpListPosition', handleJumpPosition)
    }
  }, [])

  const activeIndex = usePlayIndex()
  const handlePlay = (item: LX.Music.MusicInfo) => {
    // 按歌曲 ID 播放（列表可能被排序/分组显示，索引会错位）
    void playListById(listState.activeListId, item.id)
  }

  const handleUpdateSelectedList = (newList: LX.List.ListMusics) => {
    if (selectedListRef.current.length && newList.length == currentList.length) onSelectAll(true)
    else if (selectedListRef.current.length == currentList.length) onSelectAll(false)
    selectedListRef.current = newList
    setSelectedList(newList)
  }
  const handleSelect = (item: LX.Music.MusicInfo, pressIndex: number) => {
    let newList: LX.List.ListMusics
    if (selectModeRef.current == 'single') {
      prevSelectIndexRef.current = pressIndex
      const index = selectedListRef.current.indexOf(item)
      if (index < 0) {
        newList = [...selectedListRef.current, item]
      } else {
        newList = [...selectedListRef.current]
        newList.splice(index, 1)
      }
    } else {
      if (selectedListRef.current.length) {
        const prevIndex = prevSelectIndexRef.current
        const currentIndex = pressIndex
        if (prevIndex == currentIndex) {
          newList = []
        } else if (currentIndex > prevIndex) {
          newList = currentList.slice(prevIndex, currentIndex + 1)
        } else {
          newList = currentList.slice(currentIndex, prevIndex + 1)
          newList.reverse()
        }
      } else {
        newList = [item]
        prevSelectIndexRef.current = pressIndex
      }
    }

    handleUpdateSelectedList(newList)
  }

  const handlePress = (item: LX.Music.MusicInfo, index: number) => {
    // console.log(global.lx.homePagerIdle)
    requestAnimationFrame(() => {
      // console.log(global.lx.homePagerIdle)
      if (!global.lx.homePagerIdle) return
      if (isMultiSelectModeRef.current) {
        handleSelect(item, index)
      } else {
        handlePlay(item)
      }
    })
  }

  const handleScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = nativeEvent.contentOffset.y
    if (listFirstScrollRef.current) {
      listFirstScrollRef.current = false
      return
    }
    void saveListPosition(listState.activeListId, nativeEvent.contentOffset.y)
  }

  const renderItem: FlatListType['renderItem'] = ({ item, index }) => (
    <ListItem
      item={item}
      index={index}
      activeIndex={activeIndex}
      onPress={handlePress}
      onLongPressDrag={handleDragStart}
      onShowMenu={onShowMenu}
      selectedList={selectedList}
      rowInfo={rowInfo.current}
      isShowAlbumName={isShowAlbumName}
      isShowInterval={isShowInterval}
      isDragging={dragId == item.id}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    />
  )
  const getkey: FlatListType['keyExtractor'] = item => item.id
  const getItemLayout: FlatListType['getItemLayout'] = (data, index) => {
    return { length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index }
  }
  const isDragging = dragId != null

  return (
    <View style={styles.container} onLayout={handleListLayout}>
      <FlatList
        ref={flatListRef}
        onScroll={handleScroll}
        style={styles.list}
        data={currentList}
        maxToRenderPerBatch={isDragging ? 12 : 4}
        numColumns={rowInfo.current.rowNum}
        horizontal={false}
        // updateCellsBatchingPeriod={80}
        windowSize={isDragging ? 21 : 8}
        // 拖拽期间关闭裁剪子视图：避免自动滚动跨页时单元格反复挂载/卸载导致文字抖动
        removeClippedSubviews={!isDragging}
        initialNumToRender={12}
        renderItem={renderItem}
        keyExtractor={getkey}
        extraData={`${activeIndex}|${dragId ?? ''}`}
        getItemLayout={getItemLayout}
      />
      {
        // 拖动浮层：页面坐标定位，不随列表滚动，彻底消除滚动与位移的帧错位
        overlay
          ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: overlay.x,
                top: overlay.y - listPageRef.current.y,
                width: rowInfo.current.rowWidth,
                zIndex: 100,
              }}
            >
              <ListItem
                item={overlay.item}
                index={dragIndexRef.current}
                activeIndex={activeIndex}
                onPress={handlePress}
                onLongPressDrag={handleDragStart}
                onShowMenu={onShowMenu}
                selectedList={selectedList}
                rowInfo={rowInfo.current}
                isShowAlbumName={isShowAlbumName}
                isShowInterval={isShowInterval}
                isOverlay
              />
            </View>
            )
          : null
      }
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  list: {
    flexGrow: 1,
    flexShrink: 1,
  },
})

export default List
