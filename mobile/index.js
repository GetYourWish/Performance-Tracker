// App entry.
// react-native-get-random-values MUST be imported before anything that can
// load uuid (i.e. @performance-tracker/core): Hermes has no
// crypto.getRandomValues, and core's generateId() is uuid-v4 based.
import 'react-native-get-random-values'
import { registerRootComponent } from 'expo'

import App from './App'

// registerRootComponent ensures the Expo environment (Go / prebuilt) mounts App.
registerRootComponent(App)
