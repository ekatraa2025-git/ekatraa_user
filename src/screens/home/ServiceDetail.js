import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { useTheme } from '../../context/ThemeContext';
import BottomTabBar from '../../components/BottomTabBar';

export default function ServiceDetail({ route, navigation }) {
    const { service } = route.params;
    const { theme } = useTheme();

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
            <View style={[styles.detailHeader, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <Text style={{ fontSize: 24 }}>⬅️</Text>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Service Details</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Menu')} style={styles.iconBtn}>
                    <Text style={{ fontSize: 28, color: theme.text }}>☰</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={[styles.iconContainer, { backgroundColor: theme.inputBackground }]}>
                    <Text style={{ fontSize: 80 }}>{service?.icon || '🎯'}</Text>
                </View>

                <Text style={[styles.name, { color: theme.text }]}>{service?.name || 'Service'}</Text>
                <Text style={[styles.description, { color: theme.textLight }]}>
                    Professional {service?.name || 'event'} services for all your event needs.
                    Verified professionals with years of experience in making events successful.
                </Text>

                <View style={[styles.infoBox, { backgroundColor: theme.inputBackground }]}>
                    <Text style={[styles.infoTitle, { color: theme.text }]}>Service Includes:</Text>
                    <Text style={[styles.infoItem, { color: theme.text }]}>• Professional Consultation</Text>
                    <Text style={[styles.infoItem, { color: theme.text }]}>• Customized Packages</Text>
                    <Text style={[styles.infoItem, { color: theme.text }]}>• On-site Support</Text>
                </View>

                <Button
                    title="Contact Provider"
                    onPress={() => alert('Contact feature coming soon!')}
                    style={{ marginTop: 40 }}
                />
            </ScrollView>
            <BottomTabBar navigation={navigation} activeRoute="Home" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    detailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    iconBtn: {
        padding: 5,
    },
    content: {
        padding: 20,
        alignItems: 'center',
    },
    iconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    name: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    description: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 24,
    },
    infoBox: {
        width: '100%',
        padding: 20,
        borderRadius: 12,
        alignItems: 'flex-start',
    },
    infoTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    infoItem: {
        fontSize: 16,
        marginBottom: 8,
    }
});
