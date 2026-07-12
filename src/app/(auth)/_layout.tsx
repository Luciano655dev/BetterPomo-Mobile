import { Redirect, Stack } from "expo-router";
import React from "react";
import { useAuth } from "@/providers/AuthProvider";

export default function AuthLayout() {
  const { session } = useAuth();
  if (session) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
