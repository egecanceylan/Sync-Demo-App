import React, { useEffect } from 'react';
import { View, Text, Button } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { fetchData, updateData } from './store'; 
import AsyncStorage from '@react-native-async-storage/async-storage';

const MyComponent = () => {
    const dispatch = useDispatch();
    const data = useSelector((state) => state.data.data);

    // Load data on mount
    useEffect(() => {
        dispatch(fetchData()); // Calls the modified fetchData function
    }, [dispatch]);

    // Function to handle the update
    const handleUpdate = (id, newValue) => {
        dispatch(updateData(id, newValue));
    };

    return (
        <View>
            {data ? (
                data.map(item => (
                    <View key={item.id}>
                        <Text>{item.name}</Text>
                        <Button
                            title="Update Value"
                            onPress={() => handleUpdate(item.id, 'New Value')}
                        />
                    </View>
                ))
            ) : (
                <Text>No data available</Text>
            )}
        </View>
    );
};

export default MyComponent;
