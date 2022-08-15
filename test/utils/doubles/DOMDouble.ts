import AbstractDouble from './AbstractDouble';
import MediaDevicesFake from './fakes/navigator/MediaDevicesFake';

interface InitNavigatorParams {
  mediaDevices?: Partial<MediaDevices>;
}

const createDocument = () => ({});

const createNavigator = (): Pick<Navigator, 'mediaDevices'> => ({
  mediaDevices: new MediaDevicesFake(),
});

const createWindow = () => ({
  document: createDocument(),
  navigator: createNavigator(),
});

Object.defineProperty(global, 'window', {
  value: createWindow(),
  writable: true,
});
Object.defineProperty(global, 'document', {
  value: global.window.document,
  writable: true,
});
Object.defineProperty(global, 'navigator', {
  value: global.window.navigator,
  writable: true,
});

Object.defineProperty(global, 'RTCPeerConnection', {
  value: class RTCPeerConnection {},
  writable: false,
});

class DOMDouble extends AbstractDouble {
  initAll(): void {
    this.initWindow();
    this.initNavigator();
    this.initDocument();
  }

  initWindow(): void {
    Object.defineProperty(global, 'window', { value: createWindow() });
  }

  initDocument(): void {
    const document = createDocument();
    Object.defineProperty(global, 'document', { value: document });
    Object.defineProperty(global.window, 'document', { value: document });
  }

  initNavigator(navigatorProps: InitNavigatorParams = {}): void {
    const baseNavigator = createNavigator();
    const navigator = { ...baseNavigator, ...navigatorProps };
    Object.defineProperty(global, 'navigator', { value: navigator });
    Object.defineProperty(global.window, 'navigator', { value: navigator });
  }

  restoreAll() {
    super.restoreAll();
    this.initAll();
  }
}

export default DOMDouble;
