import { KYCStatus } from "@/types/kyc";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface KYCStatusBadgeProps {
  status: KYCStatus;
  className?: string;
}

const statusConfig: Record<
  KYCStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pending",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
  },
  VERIFIED: {
    label: "Verified",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  REJECTED: {
    label: "Rejected",
    className: "bg-red-100 text-red-800 border-red-200",
  },
  SUSPENDED: {
    label: "Suspended",
    className: "bg-orange-100 text-orange-800 border-orange-200",
  },
  EXPIRED: {
    label: "Expired",
    className: "bg-gray-100 text-gray-600 border-gray-200",
  },
};

export default function KYCStatusBadge({ status, className }: KYCStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.PENDING;

  return (
    <Badge
      variant="outline"
      className={cn(config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
