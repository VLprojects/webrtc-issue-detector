import DOMDouble from './DOMDouble';
import SocketClientDouble from './network/SocketClientDouble';
import AxiosDouble from './network/AxiosDouble';
import DeviceDouble from './mediasoup/DeviceDouble';
import LoadBalancerApiClientDouble from './LoadBalancerApiClientDouble';
import SocketDouble from './network/SocketDouble';
import DefaultTimeProviderDouble from './DefaultTimeProviderDouble';

export const timeProviderDouble = new DefaultTimeProviderDouble();
export const domDouble = new DOMDouble();
export const socketClientDouble = new SocketClientDouble();
export const socketDouble = new SocketDouble();
export const axiosDouble = new AxiosDouble();
export const deviceDouble = new DeviceDouble();
export const loadBalancerApiClientDouble = new LoadBalancerApiClientDouble();
