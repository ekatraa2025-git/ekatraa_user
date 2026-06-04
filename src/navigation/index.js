import React, { useState, useCallback } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';

/** RN 7 may not export this from native — same logic as @react-navigation/core */
function getFocusedRouteNameFromState(state) {
    if (!state?.routes?.length) return undefined;
    const index = state.index ?? 0;
    const route = state.routes[index];
    if (!route) return undefined;
    if (route.state != null) {
        return getFocusedRouteNameFromState(route.state);
    }
    return route.name;
}
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import GlobalAppHeader from '../components/GlobalAppHeader';

// Screens
import Splash from '../screens/onboarding/Splash';
import Onboarding from '../screens/onboarding/Onboarding';
import Login from '../screens/auth/Login';
import Otp from '../screens/auth/Otp';
import Register from '../screens/auth/Register';
import Home from '../screens/home/Home';
import VenueDetail from '../screens/home/VenueDetail';
import ServiceDetail from '../screens/home/ServiceDetail';
import VendorsList from '../screens/home/VendorsList';
import VendorDetail from '../screens/home/VendorDetail';
import CategoryServices from '../screens/home/CategoryServices';
import SpecialServices from '../screens/home/SpecialServices';
import Menu from '../screens/menu/Menu';
import SavedRecommendations from '../screens/menu/SavedRecommendations';
import SavedRecommendationDetail from '../screens/menu/SavedRecommendationDetail';
import MyBookings from '../screens/bookings/MyBookings';
import MyProfile from '../screens/profile/MyProfile';
import MyEnquiries from '../screens/enquiries/MyEnquiries';
import Cart from '../screens/cart/Cart';
import Checkout from '../screens/orders/Checkout';
import OrderDetail from '../screens/orders/OrderDetail';
import OrderSummary from '../screens/orders/OrderSummary';
import BalancePayment from '../screens/orders/BalancePayment';
import MyOrders from '../screens/orders/MyOrders';
import About from '../screens/about/About';
import HelpSupport from '../screens/help/HelpSupport';
import GuestManage from '../screens/guests/GuestManage';
import NotificationsList from '../screens/notifications/NotificationsList';

const Stack = createNativeStackNavigator();

const SCREENS_WITHOUT_GLOBAL_HEADER = new Set([
    'Splash',
    'Onboarding',
    'Login',
    'Otp',
    'Register',
]);

export default function AppNavigator() {
    const [routeName, setRouteName] = useState(null);
    const navigationRef = useNavigationContainerRef();

    const onNavStateChange = useCallback((state) => {
        if (!state) {
            setRouteName(null);
            return;
        }
        setRouteName(getFocusedRouteNameFromState(state) ?? null);
    }, []);

    const onReady = useCallback(() => {
        const state = navigationRef.getRootState();
        if (state) {
            setRouteName(getFocusedRouteNameFromState(state) ?? null);
        }
    }, [navigationRef]);

    const showGlobalHeader = routeName != null && !SCREENS_WITHOUT_GLOBAL_HEADER.has(routeName);

    return (
        <NavigationContainer ref={navigationRef} onReady={onReady} onStateChange={onNavStateChange}>
            <Stack.Navigator
                initialRouteName="Splash"
                screenOptions={{
                    headerShown: false,
                    animation: 'fade',
                }}
            >
                {/* Onboarding Flow */}
                <Stack.Screen name="Splash" component={Splash} />
                <Stack.Screen
                    name="Onboarding"
                    component={Onboarding}
                    options={{ animation: 'slide_from_right' }}
                />

                {/* Main App - No login required to access */}
                <Stack.Screen
                    name="Home"
                    component={Home}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="VenueDetail"
                    component={VenueDetail}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="ServiceDetail"
                    component={ServiceDetail}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="VendorsList"
                    component={VendorsList}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="VendorDetail"
                    component={VendorDetail}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="CategoryServices"
                    component={CategoryServices}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="SpecialServices"
                    component={SpecialServices}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="MyBookings"
                    component={MyBookings}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="MyProfile"
                    component={MyProfile}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="MyEnquiries"
                    component={MyEnquiries}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="Cart"
                    component={Cart}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="Checkout"
                    component={Checkout}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="OrderDetail"
                    component={OrderDetail}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="OrderSummary"
                    component={OrderSummary}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="BalancePayment"
                    component={BalancePayment}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="MyOrders"
                    component={MyOrders}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="About"
                    component={About}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="HelpSupport"
                    component={HelpSupport}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="GuestManage"
                    component={GuestManage}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="Notifications"
                    component={NotificationsList}
                    options={{ animation: 'slide_from_right' }}
                />

                {/* Auth Screens - Only shown when login is needed */}
                <Stack.Screen
                    name="Login"
                    component={Login}
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
                    }}
                />
                <Stack.Screen
                    name="Otp"
                    component={Otp}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="Register"
                    component={Register}
                    options={{ animation: 'slide_from_right' }}
                />

                {/* Menu / Profile */}
                <Stack.Screen
                    name="Menu"
                    component={Menu}
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
                    }}
                />
                <Stack.Screen
                    name="SavedRecommendations"
                    component={SavedRecommendations}
                    options={{ animation: 'slide_from_right' }}
                />
                <Stack.Screen
                    name="SavedRecommendationDetail"
                    component={SavedRecommendationDetail}
                    options={{ animation: 'slide_from_right' }}
                />
            </Stack.Navigator>
            <GlobalAppHeader visible={showGlobalHeader} />
        </NavigationContainer>
    );
}
