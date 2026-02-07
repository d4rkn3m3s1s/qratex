c = open('app/customer/feedbacks/page.tsx', 'r', encoding='utf-8').read()

# 1. Add CheckCircle2 and Store to imports
c = c.replace(
    "  ArrowRight,\n} from 'lucide-react';",
    "  ArrowRight,\n  CheckCircle2,\n  Store,\n} from 'lucide-react';"
)

# 2. Add dealerReply to QRFeedback interface
c = c.replace(
    """  qrCode: {
    name: string;
    businessName: string;
  };
}""",
    """  qrCode: {
    name: string;
    businessName: string;
  };
  dealerReply?: string | null;
  dealerRepliedAt?: string | null;
}""",
    1  # first occurrence only
)

# 3. Add dealerReply to the formatted feedbacks mapping
c = c.replace(
    """          qrCode: {
            name: f.qrCode?.name || 'QR',
            businessName: f.qrCode?.name || 'İşletme',
          },""",
    """          qrCode: {
            name: f.qrCode?.name || 'QR',
            businessName: f.qrCode?.name || 'İşletme',
          },
          dealerReply: f.dealerReply || null,
          dealerRepliedAt: f.dealerRepliedAt || null,"""
)

# Find the QR feedback rendering and add dealer reply display
# Look for the pattern in QR tab content where feedbacks are rendered
# The QR feedbacks tab should show dealer reply if exists
# Let me find a unique anchor point in the QR feedback rendering

print("Customer feedbacks updated!")
open('app/customer/feedbacks/page.tsx', 'w', encoding='utf-8').write(c)
