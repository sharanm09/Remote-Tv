import { configureStore } from '@reduxjs/toolkit';

// Import reducers here when created
// import authReducer from '../features/auth/authSlice';

const store = configureStore({
    reducer: {
        // auth: authReducer,
        app: (state = {}) => state, // Dummy reducer to satisfy Redux Toolkit
    },
});

export default store;
