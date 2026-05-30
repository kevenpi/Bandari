// Scaffold entry for the Expo app. Expo/React Native deps are added later
// (see README); the imports below light up once they're installed. The data
// layer (api.ts) already works against the shared contract today.
import React, { useEffect, useState } from "react";
import { SafeAreaView, Text, View, FlatList } from "react-native";
import { STATUS_META, type PaymentView } from "@bandari/shared";
import { api } from "./src/api";

export default function App() {
  const [payments, setPayments] = useState<PaymentView[]>([]);

  useEffect(() => {
    api.listPayments().then(setPayments).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Bandari</Text>
      <Text style={{ color: "#697386", marginBottom: 16 }}>Kenya → China payments</Text>
      <FlatList
        data={payments}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: "#e3e8ee" }}>
            <Text style={{ fontWeight: "600" }}>{item.id.slice(0, 14)}…</Text>
            <Text style={{ color: "#3c4257" }}>{STATUS_META[item.status].label}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
