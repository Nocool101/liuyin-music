import { View } from 'react-native'
import Text from '@/components/common/Text'
import ModalContent from './ModalContent'

export default ({ componentId }: { componentId: string }) => {
  return (
    <ModalContent>
      <View style={{ padding: 20, alignItems: 'center' }}>
        <Text>同步功能已移除</Text>
      </View>
    </ModalContent>
  )
}
