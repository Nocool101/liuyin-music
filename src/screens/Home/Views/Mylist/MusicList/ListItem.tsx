import { memo, useRef } from 'react'
import { PanResponder, View, TouchableOpacity, type GestureResponderEvent } from 'react-native'
import { LIST_ITEM_HEIGHT } from '@/config/constant'
// import { BorderWidths } from '@/theme'
import { Icon } from '@/components/common/Icon'
import { createStyle, type RowInfo } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useAssertApiSupport } from '@/store/common/hook'
import { scaleSizeH } from '@/utils/pixelRatio'
import Text from '@/components/common/Text'
import Badge from '@/components/common/Badge'

export const ITEM_HEIGHT = scaleSizeH(LIST_ITEM_HEIGHT)

export default memo(({ item, index, activeIndex, onPress, onLongPressDrag, onShowMenu, selectedList, rowInfo, isShowAlbumName, isShowInterval, isDragging, isOverlay, onDragMove, onDragEnd }: {
  item: LX.Music.MusicInfo
  index: number
  activeIndex: number
  onPress: (item: LX.Music.MusicInfo, index: number) => void
  onLongPressDrag: (index: number, pageX: number, pageY: number, locX: number, locY: number) => void
  onShowMenu: (item: LX.Music.MusicInfo, index: number, position: { x: number, y: number, w: number, h: number }) => void
  selectedList: LX.Music.MusicInfo[]
  rowInfo: RowInfo
  isShowAlbumName: boolean
  isShowInterval: boolean
  isDragging?: boolean
  isOverlay?: boolean
  onDragMove?: (dx: number, dy: number) => void
  onDragEnd?: () => void
}) => {
  const theme = useTheme()

  const isSelected = selectedList.includes(item)
  // console.log(item.name, selectedList, selectedList.includes(item))
  const isSupported = useAssertApiSupport(item.source)
  const moreButtonRef = useRef<TouchableOpacity>(null)
  // 供 PanResponder 回调读取最新 index（PanResponder 仅创建一次，闭包会过期）
  const latestRef = useRef({ index })
  latestRef.current = { index }
  // 'none' 未拖拽 | 'pending' 已长按待拖动 | 'dragging' 已接管手势拖动中
  const dragStateRef = useRef<'none' | 'pending' | 'dragging'>('none')
  const dragPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // 长按生效后再接管手势：随手指拖动排序；未长按则让位给点击与列表滚动
    onMoveShouldSetPanResponder: (_evt, gestureState) => {
      return dragStateRef.current == 'pending' && (Math.abs(gestureState.dy) > 2 || Math.abs(gestureState.dx) > 2)
    },
    onPanResponderGrant: (_evt, gestureState) => {
      dragStateRef.current = 'dragging'
      // 同步到当前手指增量（长按到首次移动间手指可能已偏移）
      onDragMove?.(gestureState.dx, gestureState.dy)
    },
    onPanResponderMove: (_evt, gestureState) => {
      onDragMove?.(gestureState.dx, gestureState.dy)
    },
    onPanResponderRelease: () => {
      dragStateRef.current = 'none'
      onDragEnd?.()
    },
    onPanResponderTerminate: () => {
      dragStateRef.current = 'none'
      onDragEnd?.()
    },
  })).current

  const handleShowMenu = () => {
    if (moreButtonRef.current?.measure) {
      moreButtonRef.current.measure((fx, fy, width, height, px, py) => {
        // console.log(fx, fy, width, height, px, py)
        onShowMenu(item, index, { x: Math.ceil(px), y: Math.ceil(py), w: Math.ceil(width), h: Math.ceil(height) })
      })
    }
  }
  const handleLongPress = (event: GestureResponderEvent) => {
    if (dragStateRef.current != 'none') return
    dragStateRef.current = 'pending'
    // 长按即开始拖拽：歌曲悬浮，不松手即可拖动
    onLongPressDrag(latestRef.current.index, event.nativeEvent.pageX, event.nativeEvent.pageY, event.nativeEvent.locationX, event.nativeEvent.locationY)
  }
  const handlePressOut = () => {
    // 长按后未拖动（PanResponder 未接管）即松手：取消拖拽
    if (dragStateRef.current != 'pending') return
    dragStateRef.current = 'none'
    onDragEnd?.()
  }
  const active = activeIndex == index

  const singer = `${item.singer}${isShowAlbumName && item.meta.albumName ? ` · ${item.meta.albumName}` : ''}`

  return (
    <View {...dragPanResponder.panHandlers} style={{
      ...styles.listItem,
      width: rowInfo.rowWidth,
      height: ITEM_HEIGHT,
      backgroundColor: isOverlay ? theme['c-content-background'] : (isSelected ? theme['c-primary-background-hover'] : 'rgba(0,0,0,0)'),
      opacity: !isSupported ? 0.5 : (isDragging && !isOverlay ? 0 : 1),
      ...(isOverlay ? {
        zIndex: 100,
        elevation: 8,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      } : null),
    }}>
      <TouchableOpacity style={styles.listItemLeft} onPress={() => { onPress(item, index) }} onLongPress={handleLongPress} onPressOut={handlePressOut}>
        {
          active
            ? <Icon style={styles.sn} name="play-outline" size={13} color={theme['c-primary-font']} />
            : <Text style={styles.sn} size={13} color={theme['c-300']}>{index + 1}</Text>
        }
        <View style={styles.itemInfo}>
          {/* <View style={styles.listItemTitle}> */}
          <Text color={active ? theme['c-primary-font'] : theme['c-font']} numberOfLines={1}>{item.name}</Text>
          {/* </View> */}
          <View style={styles.listItemSingle}>
            <Badge>{item.source.toUpperCase()}</Badge>
            <Text style={styles.listItemSingleText} size={11} color={active ? theme['c-primary-alpha-200'] : theme['c-500']} numberOfLines={1}>
              {singer}
            </Text>
          </View>
        </View>
        {
          isShowInterval ? (
            <Text size={12} color={active ? theme['c-primary-alpha-400'] : theme['c-250']} numberOfLines={1}>{item.interval}</Text>
          ) : null
        }
      </TouchableOpacity>
      {/* <View style={styles.listItemRight}> */}
      <TouchableOpacity onPress={handleShowMenu} ref={moreButtonRef} style={styles.moreButton}>
        <Icon name="dots-vertical" style={{ color: theme['c-350'] }} size={12} />
      </TouchableOpacity>
      {/* </View> */}
    </View>
  )
}, (prevProps, nextProps) => {
  return !!(prevProps.item === nextProps.item &&
    prevProps.index === nextProps.index &&
    prevProps.isShowAlbumName === nextProps.isShowAlbumName &&
    prevProps.isShowInterval === nextProps.isShowInterval &&
    prevProps.activeIndex != nextProps.index &&
    nextProps.activeIndex != nextProps.index &&
    nextProps.selectedList.includes(nextProps.item) == prevProps.selectedList.includes(nextProps.item) &&
    prevProps.isDragging == nextProps.isDragging &&
    prevProps.isOverlay == nextProps.isOverlay
  )
})


const styles = createStyle({
  listItem: {
    // width: '50%',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    // paddingLeft: 10,
    paddingRight: 2,
    alignItems: 'center',
    // borderBottomWidth: BorderWidths.normal,
  },
  listItemLeft: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sn: {
    width: 38,
    // fontSize: 12,
    textAlign: 'center',
    // backgroundColor: 'rgba(0,0,0,0.2)',
    paddingLeft: 3,
    paddingRight: 3,
  },
  itemInfo: {
    flexGrow: 1,
    flexShrink: 1,
    // paddingTop: 10,
    // paddingBottom: 10,
    paddingRight: 2,
  },
  // listItemTitle: {
  //   flexGrow: 0,
  //   flexShrink: 1,
  // },
  listItemSingle: {
    paddingTop: 3,
    flexDirection: 'row',
    // alignItems: 'flex-end',
  },
  listItemSingleText: {
    // backgroundColor: 'rgba(0,0,0,0.2)',
    flexGrow: 0,
    flexShrink: 1,
    fontWeight: '300',
    // fontSize: 15,
  },
  // listItemBadge: {
  //   // fontSize: 10,
  //   paddingLeft: 5,
  //   paddingTop: 2,
  //   alignSelf: 'flex-start',
  // },
  listItemRight: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    justifyContent: 'center',
  },

  moreButton: {
    height: '80%',
    paddingLeft: 16,
    paddingRight: 16,
    // paddingTop: 10,
    // paddingBottom: 10,
    // backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
  },
})
