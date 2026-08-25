import { View } from 'react-native'
import { Navigation } from 'react-native-navigation'

import Button from '@/components/common/Button'
import { createStyle, openUrl } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import Text from '@/components/common/Text'
import ModalContent from './ModalContent'

const PROJECT_URL = 'https://github.com/Nocool101/liuyin-music'

const Content = () => {
  const theme = useTheme()

  const openProjectPage = () => {
    void openUrl(PROJECT_URL)
  }

  const textLinkStyle = {
    ...styles.text,
    textDecorationLine: 'underline',
    color: theme['c-primary-font'],
  } as const

  return (
    <View style={styles.main}>
      <Text style={styles.title} size={18}>{global.i18n.t('nav_about')}</Text>
      <View style={styles.content}>
        <Text selectable style={styles.text}>开发：COOL</Text>
        <View style={styles.gap} />
        <Text selectable style={styles.text}>美术指导：小羊昊昊 小猪颖颖</Text>
        <View style={styles.gap} />
        <Text selectable style={styles.text}>项目地址：</Text>
        <Text selectable style={textLinkStyle} onPress={openProjectPage}>{PROJECT_URL}</Text>
      </View>
    </View>
  )
}

const AboutModal = ({ componentId }: { componentId: string }) => {
  const theme = useTheme()
  const t = useI18n()
  return (
    <ModalContent>
      <Content />
      <View style={styles.btns}>
        <Button style={{ ...styles.btn, backgroundColor: theme['c-button-background'] }} onPress={() => {
          void Navigation.dismissOverlay(componentId)
        }}>
          <Text color={theme['c-button-font']}>{t('close')}</Text>
        </Button>
      </View>
    </ModalContent>
  )
}

const styles = createStyle({
  main: {
    flexShrink: 1,
    marginTop: 15,
    marginBottom: 10,
  },
  content: {
    marginLeft: 25,
    marginRight: 25,
    marginBottom: 15,
  },
  title: {
    textAlign: 'center',
    marginBottom: 20,
  },
  text: {
    fontSize: 14,
    textAlignVertical: 'bottom',
  },
  gap: {
    height: 14,
  },
  btns: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: 15,
    paddingLeft: 15,
  },
  btn: {
    flex: 1,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 10,
    paddingRight: 10,
    alignItems: 'center',
    borderRadius: 4,
    marginRight: 15,
  },
})

export default AboutModal
