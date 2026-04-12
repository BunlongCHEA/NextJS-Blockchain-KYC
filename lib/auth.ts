import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import axios from "axios";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // ✅ Use API_URL (server-side only env var, no NEXT_PUBLIC_ prefix)
        const apiUrl = process.env.API_URL;

        console.log("[auth] authorize() called");
        console.log("[auth] API_URL =", apiUrl);
        console.log("[auth] username =", credentials?.username);

        if (!apiUrl) {
          console.error("[auth] ERROR: API_URL is not set in .env.local");
          return null;
        }

        try {
          const response = await axios.post(
            `${process.env.API_URL}/api/v1/auth/login`,
            {
              username: credentials.username,
              password: credentials.password,
            },
            {
              headers: { "Content-Type": "application/json" },
              timeout: 10000,
            }
          );

          // ✅ Log raw response shape to confirm what Go returns
          console.log("[auth] Login response status:", response.status);
          console.log("[auth] Login response data:", JSON.stringify(response.data));

          console.log("API URL:", process.env.NEXT_PUBLIC_API_URL);

          const data = response.data;
          const payload = data?.data;

          if (payload?.access_token && payload?.user) {
            console.log("[auth] Login success for:", payload.user.username);

            return {
              id: payload.user.id,
              name: payload.user.username,
              email: payload.user.email,
              role: payload.user.role,
              accessToken: payload.access_token,
              passwordChangeRequired:
                payload.user.password_change_required ?? false,
            };
          }
          return null;
        } catch (error: any) {
          // ✅ Log the real error — visible in npm run dev terminal
          console.error("[auth] Login failed:", error?.response?.payload ?? error?.message ?? error);
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.accessToken = (user as any).accessToken;
        token.passwordChangeRequired = (user as any).passwordChangeRequired;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        (session.user as any).role = token.role;
        (session as any).accessToken = token.accessToken;
        (session as any).passwordChangeRequired = token.passwordChangeRequired;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login/admin",
  },
});
