import React, { createContext, useContext, useState, useCallback } from 'react';

const EventFormContext = createContext(undefined);

export function EventFormProvider({ children }) {
    const [eventForm, setEventFormState] = useState(null);

    const setEventForm = useCallback((form) => {
        setEventFormState(form);
    }, []);

    const clearEventForm = useCallback(() => {
        setEventFormState(null);
    }, []);

    return (
        <EventFormContext.Provider value={{ eventForm, setEventForm, clearEventForm }}>
            {children}
        </EventFormContext.Provider>
    );
}

export function useEventForm() {
    const context = useContext(EventFormContext);
    if (!context) throw new Error('useEventForm must be used within EventFormProvider');
    return context;
}
