import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh",
      background: "#0A0A0A",
    }}>
      <img
        src="https://streben.io/wp-content/uploads/2025/01/Streben-logo-final-03-1_edited.avif"
        alt="Streben"
        style={{ height: 40, marginBottom: 32 }}
      />
      <SignIn afterSignInUrl="/" />
    </div>
  );
}
