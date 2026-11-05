import AdminShell from "./components/AdminShell";
import RoleGate from "@/app/components/auth/RoleGate";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <RoleGate role="ADMIN">
            <AdminShell>{children}</AdminShell>
        </RoleGate>
    );
}
