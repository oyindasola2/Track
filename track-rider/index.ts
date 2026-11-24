// Entry point. Background tasks must be defined at module top level, BEFORE the
// app component registers, so Android can wake the JS runtime with the screen locked.
import './src/tracking';
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
