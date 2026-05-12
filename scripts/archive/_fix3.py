content = open('app/customer/badges/page.tsx', 'r', encoding='utf-8').read()
changes = 0

# 1. Grid badge icon: 96->112, better classes for earned/locked
old1 = """                          <Image
                            src={badge.icon}
                            alt={badge.name}
                            width={96}
                            height={96}
                            className={`relative z-10 drop-shadow-2xl ${!isEarned && 'grayscale opacity-60'}`}
                          />"""
new1 = """                          <Image
                            src={badge.icon}
                            alt={badge.name}
                            width={112}
                            height={112}
                            className={`relative z-10 drop-shadow-2xl ${isEarned ? 'brightness-110 saturate-125 dark:brightness-125' : 'grayscale-[50%] opacity-70 dark:brightness-150 dark:contrast-125'}`}
                          />"""
if old1 in content:
    content = content.replace(old1, new1)
    changes += 1
    print("1. Grid icon: size 96->112, brightness/saturation filters added")
else:
    print("ERROR 1: Grid icon not found")

# 2. Modal badge icon: 130->150, same filter treatment
old2 = """                    <Image
                      src={selectedBadge.icon}
                      alt={selectedBadge.name}
                      width={130}
                      height={130}
                      className={`relative z-10 drop-shadow-2xl ${!selectedBadge.earned ? 'grayscale opacity-60' : ''}`}
                    />"""
new2 = """                    <Image
                      src={selectedBadge.icon}
                      alt={selectedBadge.name}
                      width={150}
                      height={150}
                      className={`relative z-10 drop-shadow-2xl ${selectedBadge.earned ? 'brightness-110 saturate-125 dark:brightness-125' : 'grayscale-[50%] opacity-70 dark:brightness-150 dark:contrast-125'}`}
                    />"""
if old2 in content:
    content = content.replace(old2, new2)
    changes += 1
    print("2. Modal icon: size 130->150, brightness/saturation filters added")
else:
    print("ERROR 2: Modal icon not found")

open('app/customer/badges/page.tsx', 'w', encoding='utf-8').write(content)
print(f"Done! {changes} changes applied.")
