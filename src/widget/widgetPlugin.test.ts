import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'

const root = path.resolve(__dirname, '../..')
const require = createRequire(path.join(root, 'package.json'))

describe('installed 0.16.1 config plugin (in-memory file sink; not prebuild)', () => {
  it('generates the provider, XML, manifest entries, description, and bundled Fraunces', async () => {
    const files = new Map<string, string>()
    const copied = new Map<string, string>()
    const exports: { default?: (config: any, params: any) => any } = {}
    const pluginPath = require.resolve('react-native-android-widget/app.plugin.js')
    runInNewContext(readFileSync(pluginPath, 'utf8'), {
      exports,
      require: (name: string) => name === 'fs' ? {
        mkdirSync: () => {},
        writeFileSync: (file: string, data: string) => files.set(file, data),
        copyFileSync: (from: string, to: string) => { expect(existsSync(from)).toBe(true); copied.set(to, from) },
      } : require(name),
    })
    const app = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8')).expo
    const params = app.plugins.find((entry: unknown) => Array.isArray(entry) && entry[0] === 'react-native-android-widget')[1]
    const config = exports.default!(app, params)
    const request = { projectRoot: root, platformProjectRoot: path.join(root, 'android'), platform: 'android' }
    // Expo 52's mod compiler runs dangerous before manifest. This package relies
    // on cwd here: projectPaths has not yet been populated by the manifest mod.
    await config.mods.android.dangerous({ ...config, modResults: {}, modRequest: { ...request, modName: 'dangerous' } })
    const java = 'android/app/src/main/java/com/whoknowsmann/rituals/widget/RitualWidget.java'
    const xml = 'android/app/src/main/res/xml/widgetprovider_ritualwidget.xml'
    expect([...files.keys()].sort()).toEqual([java, xml].sort())
    expect(files.get(java)).toContain('public class RitualWidget extends RNWidgetProvider')
    expect(files.get(java)).toContain('package com.whoknowsmann.rituals.widget;')
    expect(files.get(xml)).toContain('android:initialLayout="@layout/rn_widget"')
    expect(files.get(xml)).toContain('android:targetCellWidth="2"')
    expect(files.get(xml)).toContain('android:targetCellHeight="2"')
    expect(files.get(xml)).toContain('android:updatePeriodMillis="1800000"')
    expect(files.get(xml)).not.toContain('android:previewImage')
    expect(files.get(xml)).not.toContain('android:configure')
    expect(copied.get('android/app/src/main/assets/fonts/Fraunces_900Black.ttf')).toBe(path.join(root, params.fonts[0]))

    const manifest = { manifest: { application: [{ $: { 'android:name': '.MainApplication' } }] } }
    const input = { ...config, modResults: manifest, modRequest: { ...request, modName: 'manifest' } }
    const result = await config.mods.android.manifest(input)
    const repeated = await config.mods.android.manifest(result)
    const application = repeated.modResults.manifest.application[0]
    expect(application.receiver).toHaveLength(1)
    expect(application.receiver[0].$).toMatchObject({ 'android:name': '.widget.RitualWidget', 'android:exported': 'false', 'android:label': 'Rituals' })
    expect(application.receiver[0]['meta-data'].$['android:resource']).toBe('@xml/widgetprovider_ritualwidget')
    expect(application.service).toEqual([{ $: { 'android:name': 'com.reactnativeandroidwidget.RNWidgetCollectionService', 'android:permission': 'android.permission.BIND_REMOTEVIEWS' } }])
    expect(application.activity).toBeUndefined()
    const strings = await config.mods.android.strings({ ...config, modResults: { resources: {} }, modRequest: { ...request, modName: 'strings' } })
    expect(strings.modResults.resources.string).toContainEqual({ $: { name: 'widget_ritualwidget_description', translatable: 'false' }, _: 'Your weekly promise' })
  })
})
