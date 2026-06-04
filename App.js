import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, View, BackHandler, ActivityIndicator, SafeAreaView, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

// CONFIGURAÇÃO: Defina aqui a URL de produção do seu web app UaiSafe hospedado na Netlify
const WEB_APP_URL = 'https://appuaisafe.netlify.app';
const SECURE_STORE_KEY = 'uaisafe_credentials';

export default function App() {
  const webViewRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);

  // Controle do botão de voltar físico no Android (para navegar no histórico do WebView)
  useEffect(() => {
    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };
    BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
  }, [canGoBack]);

  // Gerenciador de Mensagens da Web (Web-to-Native Bridge)
  const handleMessage = async (event) => {
    let data;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch (e) {
      console.warn('Falha ao decodificar mensagem do WebView:', e);
      return;
    }

    const respond = (response) => {
      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify(response));
      }
    };

    switch (data.type) {
      case 'BIOMETRIC_CHECK_REQUEST': {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
        respond({
          type: 'BIOMETRIC_CHECK_RESPONSE',
          success: true,
          isAvailable: hasHardware && isEnrolled,
          supportedTypes,
        });
        break;
      }

      case 'BIOMETRIC_SAVE_REQUEST': {
        const { username, password } = data;
        if (!username || !password) {
          respond({ type: 'BIOMETRIC_SAVE_RESPONSE', success: false, error: 'Credenciais incompletas.' });
          return;
        }
        try {
          await SecureStore.setItemAsync(SECURE_STORE_KEY, JSON.stringify({ username, password }));
          respond({ type: 'BIOMETRIC_SAVE_RESPONSE', success: true });
        } catch (e) {
          respond({ type: 'BIOMETRIC_SAVE_RESPONSE', success: false, error: e.message });
        }
        break;
      }

      case 'BIOMETRIC_CLEAR_REQUEST': {
        try {
          await SecureStore.deleteItemAsync(SECURE_STORE_KEY);
          respond({ type: 'BIOMETRIC_CLEAR_RESPONSE', success: true });
        } catch (e) {
          respond({ type: 'BIOMETRIC_CLEAR_RESPONSE', success: false, error: e.message });
        }
        break;
      }

      case 'BIOMETRIC_LOGIN_REQUEST': {
        try {
          const hasHardware = await LocalAuthentication.hasHardwareAsync();
          const isEnrolled = await LocalAuthentication.isEnrolledAsync();
          if (!hasHardware || !isEnrolled) {
            respond({ type: 'BIOMETRIC_LOGIN_RESPONSE', success: false, error: 'Biometria não disponível neste aparelho.' });
            return;
          }

          const authResult = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Acesse sua conta UaiSafe Premium',
            fallbackLabel: 'Usar senha',
            disableDeviceFallback: false,
          });

          if (authResult.success) {
            const credentialsStr = await SecureStore.getItemAsync(SECURE_STORE_KEY);
            if (credentialsStr) {
              const { username, password } = JSON.parse(credentialsStr);
              respond({ type: 'BIOMETRIC_LOGIN_RESPONSE', success: true, username, password });
            } else {
              respond({ type: 'BIOMETRIC_LOGIN_RESPONSE', success: false, error: 'Biometria ativada, mas nenhuma credencial encontrada no chaveiro seguro.' });
            }
          } else {
            respond({ type: 'BIOMETRIC_LOGIN_RESPONSE', success: false, error: 'Autenticação biométrica cancelada.' });
          }
        } catch (e) {
          respond({ type: 'BIOMETRIC_LOGIN_RESPONSE', success: false, error: e.message });
        }
        break;
      }

      default:
        console.warn('Mensagem desconhecida da WebView:', data.type);
    }
  };

  // Injeta flag global e ReactNativeWebView para garantir a compatibilidade
  const injectedJavaScript = `
    window.isNativeApp = true;
    window.ReactNativeWebView = window.ReactNativeWebView || {};
    true;
  `;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050B18" />
      <WebView
        ref={webViewRef}
        source={{ uri: WEB_APP_URL }}
        style={styles.webview}
        injectedJavaScript={injectedJavaScript}
        onMessage={handleMessage}
        onNavigationStateChange={(navState) => {
          setCanGoBack(navState.canGoBack);
        }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsBackForwardNavigationGestures={true}
        startInLoadingState={true}
        mixedContentMode="compatibility"
        allowsInlineMediaPlayback={true}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('WebView error:', nativeEvent);
        }}
        renderError={(errorDomain, errorCode, errorDesc) => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#00C2FF" />
          </View>
        )}
        onContentProcessDidTerminate={() => {
          // Reload WebView if the content process crashes (iOS)
          if (webViewRef.current) {
            webViewRef.current.reload();
          }
        }}
      />
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00C2FF" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050B18',
  },
  webview: {
    flex: 1,
    backgroundColor: '#050B18',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050B18',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
