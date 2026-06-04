import React, { createContext, useState, useContext } from 'react';
import { colors } from '../theme/colors';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const [isDarkMode, setIsDarkMode] = useState(false);

    // Toggle theme function
    const toggleTheme = () => {
        setIsDarkMode(prev => !prev);
    };

    // Get current theme colors
    const theme = isDarkMode ? colors.dark : colors.light;

    return (
        <ThemeContext.Provider value={{ isDarkMode, toggleTheme, theme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
