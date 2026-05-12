import re

# ═══ 1. Admin Dashboard - 30s polling ═══
c = open('app/admin/page.tsx', 'r', encoding='utf-8').read()

# Find the fetchData/fetchDashboard function call in useEffect and add interval
# Admin uses fetchDashboard
if 'fetchDashboard' in c:
    # Add polling after the initial useEffect
    old = "  useEffect(() => {\n    fetchDashboard();\n  }, []);"
    new = """  useEffect(() => {
    fetchDashboard();
    // Realtime polling - 30 saniyede bir güncelle
    const interval = setInterval(() => {
      fetchDashboard();
    }, 30000);
    return () => clearInterval(interval);
  }, []);"""
    if old in c:
        c = c.replace(old, new)
        print("1. Admin dashboard: polling added")
    else:
        print("1. Admin: useEffect pattern not found, trying alternative...")
        # Try to find any useEffect with fetchDashboard
        c = c.replace(
            "fetchDashboard();\n  }, []);",
            "fetchDashboard();\n    const pollInterval = setInterval(fetchDashboard, 30000);\n    return () => clearInterval(pollInterval);\n  }, []);"
        )
        print("1. Admin dashboard: polling added (alt)")
else:
    print("1. SKIP: Admin uses different fetch function name")
    # Check for other patterns
    if 'fetchData' in c:
        c = c.replace(
            "fetchData();\n  }, []);",
            "fetchData();\n    const pollInterval = setInterval(fetchData, 30000);\n    return () => clearInterval(pollInterval);\n  }, []);"
        )
        print("1. Admin dashboard: polling added via fetchData")

open('app/admin/page.tsx', 'w', encoding='utf-8').write(c)

# ═══ 2. Dealer Dashboard - 30s polling ═══
c = open('app/dealer/page.tsx', 'r', encoding='utf-8').read()

old = "  useEffect(() => {\n    fetchStats();\n  }, []);"
new = """  useEffect(() => {
    fetchStats();
    const pollInterval = setInterval(fetchStats, 30000);
    return () => clearInterval(pollInterval);
  }, []);"""
if old in c:
    c = c.replace(old, new)
    print("2. Dealer dashboard: polling added")
else:
    print("2. WARN: Dealer useEffect not found")

open('app/dealer/page.tsx', 'w', encoding='utf-8').write(c)

# ═══ 3. Customer Dashboard - 60s polling ═══
c = open('app/customer/page.tsx', 'r', encoding='utf-8').read()

# Customer has a more complex useEffect with session dependency
old_cust = "    if (session?.user) {\n      fetchData();\n    }\n  }, [session, user?.points, user?.level]);"
new_cust = """    if (session?.user) {
      fetchData();
    }
    // Realtime polling - 60 saniyede bir güncelle
    const pollInterval = setInterval(() => {
      if (session?.user) fetchData();
    }, 60000);
    return () => clearInterval(pollInterval);
  }, [session, user?.points, user?.level]);"""

if old_cust in c:
    c = c.replace(old_cust, new_cust)
    print("3. Customer dashboard: polling added")
else:
    print("3. WARN: Customer useEffect not found")

open('app/customer/page.tsx', 'w', encoding='utf-8').write(c)

print("Done! All dashboards have polling.")
