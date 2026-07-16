import {
  createConnection,
  createLongLivedTokenAuth,
  type Connection,
} from 'home-assistant-js-websocket'

// Note: Values must be prefixed with VITE_ to be exposed to Vite client code.
const HA_URL = import.meta.env.VITE_HA_URL || 'http://chaos.local:8123'
const HA_TOKEN = import.meta.env.VITE_HA_TOKEN

// Keep a cached instance of the connection so we don't spam multiple websockets
let connectionInstance: Connection | null = null

export const useHAConnection = async (): Promise<Connection> => {
  if (connectionInstance) {
    return connectionInstance
  }

  if (!HA_TOKEN) {
    throw new Error('Home Assistant token (VITE_HA_TOKEN) is missing in your .env.local file.')
  }

  // Create an authentication object using the long-lived access token
  const auth = createLongLivedTokenAuth(HA_URL, HA_TOKEN)

  try {
    // Establish the websocket connection
    connectionInstance = await createConnection({ auth })
    console.log('Successfully connected to CHAOS Home Assistant!')

    // Optional: Gracefully handle network disconnects and reconnects
    connectionInstance.addEventListener('disconnected', () => {
      console.warn('Disconnected from CHAOS Home Assistant')
    })

    connectionInstance.addEventListener('ready', () => {
      console.info('Reconnected to CHAOS Home Assistant')
    })

    return connectionInstance
  } catch (error) {
    console.error('Failed to connect to CHAOS Home Assistant:', error)
    throw error
  }
}
