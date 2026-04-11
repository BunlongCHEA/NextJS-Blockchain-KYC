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
        try {
          const response = await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/login`,
            {
              username: credentials.username,
              password: credentials.password,
            }
          );
          const data = response.data;
          if (data?.access_token && data?.user) {
            return {
              id: data.user.id,
              name: data.user.username,
              email: data.user.email,
              role: data.user.role,
              accessToken: data.access_token,
              passwordChangeRequired:
                data.user.password_change_required ?? false,
            };
          }
          return null;
        } catch {
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
