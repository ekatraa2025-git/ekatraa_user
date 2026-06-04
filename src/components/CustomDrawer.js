import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Switch } from 'react-native';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { colors } from '../theme/colors';
import { useToast } from '../context/ToastContext';

export default function CustomDrawer(props) {
    const [isDarkMode, setIsDarkMode] = React.useState(false);
    const { showConfirm } = useToast();

    const handleLogout = () => {
        showConfirm({
            title: 'Logout',
            message: 'Are you sure you want to logout?',
            cancelLabel: 'Cancel',
            confirmLabel: 'Logout',
            destructive: true,
            onConfirm: () => {
                props.navigation.reset({
                    index: 0,
                    routes: [{ name: 'Login' }],
                });
            },
        });
    };

    return (
        <View style={{ flex: 1 }}>
            <DrawerContentScrollView {...props} contentContainerStyle={{ backgroundColor: colors.primary }}>
                {/* Header Profile Section */}
                <View style={styles.profileHeader}>
                    <Image
                        source={{ uri: 'https://randomuser.me/api/portraits/men/32.jpg' }}
                        style={styles.profileImage}
                    />
                    <Text style={styles.profileName}>Suraj Kumar</Text>
                    <Text style={styles.profilePhone}>+91 84229 48781</Text>
                </View>

                {/* Default Drawer Items (Home, etc) can go here if we used standard items, 
            but we might purely custom build or leave them. 
            For now, let's keep the list container white. */}
                <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: 10 }}>
                    <DrawerItemList {...props} />
                </View>
            </DrawerContentScrollView>

            {/* Footer / Bottom Section */}
            <View style={styles.footer}>
                <View style={styles.preferenceRow}>
                    <Text style={styles.preferenceLabel}>Dark Mode</Text>
                    <Switch
                        value={isDarkMode}
                        onValueChange={setIsDarkMode}
                        trackColor={{ false: "#767577", true: colors.primary }}
                    />
                </View>
                <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                    <Text style={styles.logoutText}>🚪 Logout</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    profileHeader: {
        padding: 20,
        alignItems: 'center',
    },
    profileImage: {
        width: 80,
        height: 80,
        borderRadius: 40,
        marginBottom: 10,
        borderWidth: 2,
        borderColor: '#fff',
    },
    profileName: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    profilePhone: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
    },
    footer: {
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: '#ccc',
    },
    preferenceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    preferenceLabel: {
        fontSize: 16,
        fontWeight: '500',
        color: colors.text,
    },
    logoutBtn: {
        paddingVertical: 15,
    },
    logoutText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'red',
    }
});
