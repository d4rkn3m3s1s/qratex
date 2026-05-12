c = open('app/admin/page.tsx', 'r', encoding='utf-8').read()

# 1. Make the two-card grid responsive - stack earlier and reduce gap
c = c.replace(
    '      {/* Recent Data */}\n      <div className="grid gap-6 lg:grid-cols-2">',
    '      {/* Recent Data */}\n      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">'
)

# 2. Reduce spacing inside user list
c = c.replace(
    '''            ) : (
              <div className="space-y-4">
                {data.recentUsers.map((user, index) => (''',
    '''            ) : (
              <div className="space-y-2 sm:space-y-4">
                {data.recentUsers.map((user, index) => ('''
)

# 3. Make avatar smaller on mobile
c = c.replace(
    '<Avatar className="shrink-0">',
    '<Avatar className="shrink-0 h-8 w-8 sm:h-10 sm:w-10">'
)

# 4. Make user text smaller on mobile
c = c.replace(
    '<p className="font-medium truncate">{user.name',
    '<p className="font-medium truncate text-sm sm:text-base">{user.name'
)
c = c.replace(
    '<p className="text-sm text-muted-foreground truncate">\n                        {user.email}',
    '<p className="text-xs sm:text-sm text-muted-foreground truncate">\n                        {user.email}'
)

# 5. Make badge smaller on mobile
c = c.replace(
    '''                    <div className="text-right shrink-0">
                      <Badge variant={getRoleColor(user.role) as "default" | "secondary" | "destructive"}>
                        {getRoleLabel(user.role)}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatRelativeTime(user.createdAt)}
                      </p>
                    </div>''',
    '''                    <div className="text-right shrink-0">
                      <Badge variant={getRoleColor(user.role) as "default" | "secondary" | "destructive"} className="text-[10px] sm:text-xs">
                        {getRoleLabel(user.role)}
                      </Badge>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                        {formatRelativeTime(user.createdAt)}
                      </p>
                    </div>'''
)

# 6. Reduce spacing inside feedback list
c = c.replace(
    '''              <div className="space-y-4">
                {data.recentFeedbacks.map((feedback, index) => (''',
    '''              <div className="space-y-2 sm:space-y-4">
                {data.recentFeedbacks.map((feedback, index) => (''',
    1  # only the feedbacks one (second occurrence)
)

# 7. Make feedback text more compact
c = c.replace(
    '<p className="text-sm truncate">{feedback.text}</p>',
    '<p className="text-xs sm:text-sm truncate">{feedback.text}</p>'
)

# 8. Make stars smaller on mobile
c = c.replace(
    """<span className="text-yellow-500 text-sm">
                          {'⭐'.repeat(feedback.rating)}
                        </span>""",
    """<span className="text-yellow-500 text-xs sm:text-sm">
                          {'⭐'.repeat(feedback.rating)}
                        </span>"""
)

# 9. Feedback user/business text smaller
c = c.replace(
    '<span className="text-xs font-medium text-muted-foreground">\n                          {feedback.userName} • {feedback.businessName}',
    '<span className="text-[10px] sm:text-xs font-medium text-muted-foreground">\n                          {feedback.userName} • {feedback.businessName}'
)

open('app/admin/page.tsx', 'w', encoding='utf-8').write(c)
print("Admin recent sections fixed - more compact on mobile!")
