import { createStore, combineReducers, compose, applyMiddleware } from 'redux';
import { offline } from '@redux-offline/redux-offline';
import offlineConfig from '@redux-offline/redux-offline/lib/config';
import { createSlice } from '@reduxjs/toolkit';
import { thunk } from 'redux-thunk';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const API_URL = 'https://6734f7305995834c8a9187e5.mockapi.io/api/v1/tables';

let previousQueueLength = 0; // To track the length of the queue from the previous interval
let monitorStarted = false; // To ensure the queue monitor runs only once

// Monitors the offline queue and checks when it becomes empty
const monitorQueue = (store) => {
    if (!monitorStarted) {
        monitorStarted = true;
        setInterval(() => {
            const state = store.getState();
            const outbox = state.offline.outbox; // Retrieve the current offline queue

            // If the queue is empty and previously there were queued actions
            if (outbox.length === 0 && previousQueueLength > 0) {
                console.log('Queue is empty. Fetching updated data...');
                
                // Fetch the latest data from the API
                axios.get(API_URL)
                    .then((response) => {
                        console.log('Fetched updated data:', response.data);
                        store.dispatch(setData(response.data)); // Update Redux store
                        AsyncStorage.setItem('myData', JSON.stringify(response.data)); // Update local storage
                    })
                    .catch((error) => {
                        console.error('Error fetching updated data:', error);
                    });
            }

            // Update the previous queue length
            previousQueueLength = outbox.length;
        }, 1000); // Check every 1 second
    }
};

// Slice for managing data and handling updates
const dataSlice = createSlice({
    name: 'data',
    initialState: {
        data: [], // Initial state for the data
    },
    reducers: {
        setData: (state, action) => {
            state.data = action.payload; // Update Redux store with new data
            AsyncStorage.setItem('myData', JSON.stringify(state.data)); // Persist data in local storage
        },
        updateDataLocal: (state, action) => {
            // Placeholder for local update logic
        },
    },
});

export const { setData, updateDataLocal } = dataSlice.actions;

// Root reducer combining all slices
const rootReducer = combineReducers({
    data: dataSlice.reducer, // Add the data slice to the root reducer
});

// Custom redux-offline configuration
const customOfflineConfig = {
    ...offlineConfig,
    effect: async (effect, action) => {
        try {
            // First attempt
            return await axios(effect).then(response => response.data);
        } catch (error) {
            if (error.response && error.response.status === 401) {
                console.log('Received 401, retrying with new Bearer Token...');

                // Fetch a new Bearer Token
                const newToken = await getNewBearerToken();

                // Retry the request with the new token
                const updatedEffect = {
                    ...effect,
                    headers: {
                        ...effect.headers,
                        Authorization: `Bearer ${newToken}`,
                    },
                };

                return await axios(updatedEffect).then(response => response.data);
            }

            // For other errors, rethrow the error
            throw error;
        }
    },
    discard: (error, action, retries) => false, // Always retry the action
    retry: (action, retries) => 2000, // Retry every 2 seconds
    persistOptions: {
        storage: AsyncStorage, // Use AsyncStorage for persistence
    },
};

// Action to fetch data from local storage or API
export const fetchData = () => async (dispatch) => {
    const state = await NetInfo.fetch(); // Check network connection status

    // Load data from local storage
    try {
        const storedData = await AsyncStorage.getItem('myData');
        if (storedData) {
            console.log('Loading data from local storage...');
            dispatch(setData(JSON.parse(storedData))); // Update Redux store with local data
        } else {
            console.log('No data found in local storage');
        }
    } catch (error) {
        console.error('Error loading data from local storage:', error);
    }

    if (state.isConnected) {
        // Fetch data from API if connected
        try {
            console.log('Fetching data from API...');
            const response = await axios.get(API_URL);
            dispatch(setData(response.data)); // Update Redux store
            await AsyncStorage.setItem('myData', JSON.stringify(response.data)); // Update local storage
        } catch (error) {
            console.error('Error fetching data from API:', error);
        }
    } else {
        // Queue a GET request if offline
        console.log('No internet connection. Queuing GET request...');
        dispatch({
            type: 'data/fetchData',
            meta: {
                offline: {
                    effect: {
                        url: API_URL,
                        method: 'GET',
                    },
                    commit: {
                        type: 'data/setData',
                        payload: {}, // The data will be set here after the API call
                    },
                    rollback: {
                        type: 'data/rollbackFetch', // Handle rollback logic
                    },
                },
            },
        });
    }
};

// Action to update data and sync with the backend
export const updateData = (id, newValue) => async (dispatch) => {
    AsyncStorage.getItem('myData')
        .then((storedData) => {
            const data = JSON.parse(storedData) || [];
            const updatedData = data.map(item =>
                item.id === id ? { ...item, name: newValue } : item
            );
            AsyncStorage.setItem('myData', JSON.stringify(updatedData)); // Update local storage
            dispatch(setData(updatedData)); // Update Redux store
        })
        .catch((error) => console.error('Error updating local storage:', error));

    const state = await NetInfo.fetch();

    if (state.isConnected) {
        await axios.put(`${API_URL}/${id}`, { name: newValue }); // Update API if connected
    } else {
        // Queue the PUT request if offline
        monitorQueue(store); // Ensure queue monitor is running
        dispatch({
            type: 'data/updateData',
            payload: { id, newValue },
            meta: {
                offline: {
                    effect: {
                        url: `${API_URL}/${id}`,
                        method: 'PUT',
                        data: { name: newValue },
                    },
                    commit: { type: 'data/updateDataLocal', payload: { id, newValue } },
                    rollback: { type: 'data/rollbackUpdate', payload: { id } },
                },
            },
        });
    }
};

// Function to retrieve a new Bearer Token
const getNewBearerToken = async () => {
    // Logic to fetch a new Bearer Token
};

// Create the Redux store with redux-offline enhancer and middleware
const store = createStore(
    rootReducer,
    compose(
        applyMiddleware(thunk), // Middleware for async actions
        offline(customOfflineConfig) // Add redux-offline enhancer
    )
);

export default store;
