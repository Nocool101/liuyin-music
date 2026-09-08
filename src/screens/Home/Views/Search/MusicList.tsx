import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import OnlineList, { type OnlineListType, type OnlineListProps } from '@/components/OnlineList'
import { search } from '@/core/search/music'
import searchMusicState, { type Source } from '@/store/search/music/state'

// export type MusicListProps = Pick<OnlineListProps,
// 'onLoadMore'
// | 'onPlayList'
// | 'onRefresh'
// >

export interface MusicListType {
  loadList: (text: string, source: Source) => void
}

export default forwardRef<MusicListType, {}>((props, ref) => {
  const listRef = useRef<OnlineListType>(null)
  const searchInfoRef = useRef<{ text: string, source: Source }>({ text: '', source: 'kw' })
  const isUnmountedRef = useRef(false)
  useImperativeHandle(ref, () => ({
    async loadList(text, source) {
      // const listDetailInfo = searchMusicState.listDetailInfo
      listRef.current?.setList([], false, source == 'all')
      if (searchMusicState.searchText == text && searchMusicState.source == source && searchMusicState.listInfos[searchMusicState.source]!.list.length) {
        requestAnimationFrame(() => {
          listRef.current?.setList(searchMusicState.listInfos[searchMusicState.source]!.list, false, source == 'all')
        })
      } else {
        listRef.current?.setStatus('loading')
        const page = 1
        searchInfoRef.current.text = text
        searchInfoRef.current.source = source
        // 聚合搜索渐进渲染：每个音源返回即刷新列表，不等最慢的源
        return search(text, page, source, (partialList) => {
          if (isUnmountedRef.current || !partialList.length) return
          listRef.current?.setList(partialList, false, source == 'all')
          listRef.current?.setStatus('idle')
        }).then((list) => {
          // const result = setListInfo(listDetail, id, page)
          if (isUnmountedRef.current) return
          requestAnimationFrame(() => {
            listRef.current?.setList(list, false, source == 'all')
            listRef.current?.setStatus(searchMusicState.listInfos[searchMusicState.source]!.maxPage <= page ? 'end' : 'idle')
          })
        }).catch(() => {
          listRef.current?.setStatus('error')
        })
      }
    },
  }), [])

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])


  const handleRefresh: OnlineListProps['onRefresh'] = () => {
    const page = 1
    listRef.current?.setStatus('refreshing')
    search(searchInfoRef.current.text, page, searchInfoRef.current.source, (partialList) => {
      if (isUnmountedRef.current || !partialList.length) return
      listRef.current?.setList(partialList, false, searchInfoRef.current.source == 'all')
      listRef.current?.setStatus('idle')
    }).then((list) => {
      // const result = setListInfo(listDetail, searchMusicState.listDetailInfo.id, page)
      if (isUnmountedRef.current) return
      listRef.current?.setList(list, false, searchInfoRef.current.source == 'all')
      listRef.current?.setStatus(searchMusicState.listInfos[searchInfoRef.current.source]!.maxPage <= page ? 'end' : 'idle')
    }).catch(() => {
      listRef.current?.setStatus('error')
    })
  }
  const handleLoadMore: OnlineListProps['onLoadMore'] = () => {
    listRef.current?.setStatus('loading')
    const info = searchMusicState.listInfos[searchInfoRef.current.source]!
    const page = info?.list.length ? info.page + 1 : 1
    search(searchInfoRef.current.text, page, searchInfoRef.current.source).then((list) => {
      // const result = setListInfo(listDetail, searchMusicState.listDetailInfo.id, page)
      if (isUnmountedRef.current) return
      listRef.current?.setList(list, true, searchInfoRef.current.source == 'all')
      listRef.current?.setStatus(info.maxPage <= page ? 'end' : 'idle')
    }).catch(() => {
      listRef.current?.setStatus('error')
    })
  }

  return <OnlineList
    ref={listRef}
    onRefresh={handleRefresh}
    onLoadMore={handleLoadMore}
    checkHomePagerIdle
  />
})

