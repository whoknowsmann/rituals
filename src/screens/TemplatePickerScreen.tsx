import React from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { Button, Card, Text, useTheme } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { RITUAL_TEMPLATES, templateSelectionTarget } from '../features/rituals/create/templates'

type Navigation = NativeStackNavigationProp<RootStackParamList, 'TemplatePicker'>

export function TemplatePickerScreen() {
  const navigation = useNavigation<Navigation>()
  const theme = useTheme()

  return (
    <ScrollView contentContainerStyle={styles.content} accessibilityLabel="Choose a ritual template">
      <Text variant="headlineMedium">Choose a starting point</Text>
      <Text style={{ color: theme.colors.onSurfaceVariant }}>
        Make it yours. Every field stays editable.
      </Text>
      {RITUAL_TEMPLATES.map((template) => {
        const target = templateSelectionTarget(template.category)
        return (
          <Card key={template.category} style={styles.card}>
            <Card.Content>
              <Text variant="titleLarge">{template.label}</Text>
              <Text style={styles.body}>{template.requirement}</Text>
              <Button
                mode="contained-tonal"
                onPress={() => navigation.navigate(target.name, target.params)}
                accessibilityLabel={`Use ${template.label} template`}
              >
                Use template
              </Button>
            </Card.Content>
          </Card>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14 },
  card: { borderRadius: 18 },
  body: { marginVertical: 10, lineHeight: 21 },
})
