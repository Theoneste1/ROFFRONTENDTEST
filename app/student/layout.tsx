import StudentShell from "./components/StudentShell";
import RoleGate from "@/app/components/auth/RoleGate";

export default function StudentLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <RoleGate role="STUDENT">
            <StudentShell>{children}</StudentShell>
        </RoleGate>
    );
}
