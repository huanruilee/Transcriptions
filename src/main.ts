import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './styles/tokens.css';

async function bootstrap() {
  if ('serviceWorker' in navigator && import.meta.env.DEV) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    try {
      await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}audio-sw.js`);
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(resolve, 1500);
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.clearTimeout(timeout);
            resolve();
          }, { once: true });
        });
      }
    } catch (error) {
      console.warn('[audio] streaming bridge unavailable', error);
    }
  }

  const app = createApp(App);
  app.use(createPinia());
  app.mount('#app');
}

bootstrap();
