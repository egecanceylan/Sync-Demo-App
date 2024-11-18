// App.js
import React from 'react';
import { Provider } from 'react-redux';
import store from './src/store';
import MainComponent from './src/MainComponent';

export default function App() {
  return (
    <Provider store={store}>
      <MainComponent />
    </Provider>
  );
}
