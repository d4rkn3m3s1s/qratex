'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Plus,
  Search,
  Edit,
  Trash2,
  Star,
  Sparkles,
  Crown,
  Gem,
  Shield,
  Zap,
  Users,
  Filter,
  LayoutGrid,
  List,
  Target,
  Heart,
  Flame,
  Gift,
  Medal,
  Coffee,
  MapPin,
  Clock,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface BadgeType {
  id: string;
  name: string;
  description: string;
  icon: string;
  category?: string;
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  points: number;
  requirement: string;
  isActive: boolean;
  _count?: {
    userBadges: number;
  };
}

const rarityConfig = {
  COMMON: {
    label: 'Yaygın',
    icon: Shield,
    gradient: 'from-slate-400 to-slate-600',
    bgGradient: 'bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 dark:from-[#0a0e1a] dark:via-[#111827] dark:to-[#0a0e1a]',
    borderColor: 'border-gray-300 dark:border-slate-500/40',
    glowColor: 'shadow-gray-400/20 dark:shadow-slate-400/20',
    neonGlow: 'dark:shadow-[0_0_15px_rgba(148,163,184,0.15),0_0_30px_rgba(148,163,184,0.08)]',
    textColor: 'text-gray-600 dark:text-gray-400',
    badgeBg: 'bg-gray-200 dark:bg-gray-700/50',
    iconRing: 'ring-gray-200 dark:ring-slate-500/30',
  },
  RARE: {
    label: 'Nadir',
    icon: Gem,
    gradient: 'from-blue-400 to-cyan-500',
    bgGradient: 'bg-gradient-to-br from-blue-50 via-cyan-50 to-blue-100 dark:from-[#040d1f] dark:via-[#0a1628] dark:to-[#061225]',
    borderColor: 'border-blue-300 dark:border-cyan-500/40',
    glowColor: 'shadow-blue-400/20 dark:shadow-cyan-500/30',
    neonGlow: 'dark:shadow-[0_0_15px_rgba(34,211,238,0.2),0_0_40px_rgba(34,211,238,0.1),inset_0_0_20px_rgba(34,211,238,0.05)]',
    textColor: 'text-blue-600 dark:text-cyan-400',
    badgeBg: 'bg-blue-100 dark:bg-cyan-900/40',
    iconRing: 'ring-blue-200 dark:ring-cyan-400/30',
  },
  EPIC: {
    label: 'Epik',
    icon: Zap,
    gradient: 'from-purple-400 to-pink-500',
    bgGradient: 'bg-gradient-to-br from-purple-50 via-pink-50 to-fuchsia-100 dark:from-[#0d0520] dark:via-[#150a25] dark:to-[#10061f]',
    borderColor: 'border-purple-300 dark:border-purple-500/50',
    glowColor: 'shadow-purple-400/20 dark:shadow-purple-500/30',
    neonGlow: 'dark:shadow-[0_0_15px_rgba(168,85,247,0.2),0_0_40px_rgba(168,85,247,0.1),inset_0_0_20px_rgba(168,85,247,0.05)]',
    textColor: 'text-purple-600 dark:text-purple-400',
    badgeBg: 'bg-purple-100 dark:bg-purple-900/40',
    iconRing: 'ring-purple-200 dark:ring-purple-400/30',
  },
  LEGENDARY: {
    label: 'Efsanevi',
    icon: Crown,
    gradient: 'from-amber-400 via-orange-500 to-red-500',
    bgGradient: 'bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 dark:from-[#1a0f05] dark:via-[#1f1008] dark:to-[#1a0805]',
    borderColor: 'border-amber-300 dark:border-yellow-500/50',
    glowColor: 'shadow-yellow-400/30 dark:shadow-yellow-500/50',
    neonGlow: 'dark:shadow-[0_0_20px_rgba(250,204,21,0.2),0_0_50px_rgba(250,204,21,0.1),inset_0_0_25px_rgba(250,204,21,0.05)]',
    textColor: 'text-amber-600 dark:text-yellow-400',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/40',
    iconRing: 'ring-amber-200 dark:ring-yellow-400/30',
  },
};

const categoryOptions = [
  { value: 'feedback', label: 'Geri Bildirim', icon: Target },
  { value: 'engagement', label: 'Etkileşim', icon: Heart },
  { value: 'streak', label: 'Seri', icon: Flame },
  { value: 'speed', label: 'Hız', icon: Clock },
  { value: 'exploration', label: 'Keşif', icon: MapPin },
  { value: 'expertise', label: 'Uzmanlık', icon: Coffee },
  { value: 'rating', label: 'Puanlama', icon: Star },
  { value: 'special', label: 'Özel', icon: Gift },
  { value: 'general', label: 'Genel', icon: Medal },
];

// Tüm rozet ikonları
const B = '/images/badges';
const badgeIconList: { path: string; label: string }[] = [
  // Genel Rozetler
  { path: `${B}/YENİ SES.svg`, label: 'Yeni Ses' },
  { path: `${B}/USTA YORUMCU.svg`, label: 'Usta Yorumcu' },
  { path: `${B}/YORUM MAKİNESİ.svg`, label: 'Yorum Makinesi' },
  { path: `${B}/KELİME BÜYÜCÜSÜ.svg`, label: 'Kelime Büyücüsü' },
  { path: `${B}/HAYALET YORUMCU.svg`, label: 'Hayalet Yorumcu' },
  { path: `${B}/BEĞENİ PERİSİ.svg`, label: 'Beğeni Perisi' },
  { path: `${B}/EMOJİ USTASI.svg`, label: 'Emoji Ustası' },
  { path: `${B}/FLASH.svg`, label: 'Flash' },
  { path: `${B}/KESKİN NİŞANCI.svg`, label: 'Keskin Nişancı' },
  { path: `${B}/HIZLI VE ÖFKELİ.svg`, label: 'Hızlı ve Öfkeli' },
  { path: `${B}/SESSİZ SİNEMA.svg`, label: 'Sessiz Sinema' },
  { path: `${B}/KONUK OYUNCU.svg`, label: 'Konuk Oyuncu' },
  { path: `${B}/TUR REHBERİ.svg`, label: 'Tur Rehberi' },
  { path: `${B}/MÜCEVHER.svg`, label: 'Mücevher' },
  { path: `${B}/MÜKEMMELLİYETÇİ.svg`, label: 'Mükemmeliyetçi' },
  { path: `${B}/EFSANE.svg`, label: 'Efsane' },
  { path: `${B}/TAHT SAHİBİ.svg`, label: 'Taht Sahibi' },
  { path: `${B}/SAATLİ BOMBA.svg`, label: 'Saatli Bomba' },
  { path: `${B}/FIRTINA.svg`, label: 'Fırtına' },
  { path: `${B}/FİLOZOF.svg`, label: 'Filozof' },
  { path: `${B}/NOSTALJİ RÜZGARI.svg`, label: 'Nostalji Rüzgarı' },
  { path: `${B}/İLHAM KAYNAĞI.svg`, label: 'İlham Kaynağı' },
  { path: `${B}/KATALİZÇR.svg`, label: 'Katalizör' },
  { path: `${B}/TERS KÖŞE.svg`, label: 'Ters Köşe' },
  { path: `${B}/YANKI.svg`, label: 'Yankı' },
  { path: `${B}/XRAY.svg`, label: 'X-Ray' },
  { path: `${B}/TETİKÇİ.svg`, label: 'Tetikçi' },
  { path: `${B}/sürpriz kutusu.svg`, label: 'Sürpriz Kutusu' },
  { path: `${B}/DEPRESİF.svg`, label: 'Depresif' },
  { path: `${B}/drama queen.svg`, label: 'Drama Queen' },
  { path: `${B}/copy cv.svg`, label: 'Copy CV' },
  { path: `${B}/havai fişek.svg`, label: 'Havai Fişek' },
  { path: `${B}/filiz.svg`, label: 'Filiz' },
  { path: `${B}/huysuz.svg`, label: 'Huysuz' },
  { path: `${B}/jet.svg`, label: 'Jet' },
  { path: `${B}/kafein bağımlısı.svg`, label: 'Kafein Bağımlısı' },
  { path: `${B}/leyla.svg`, label: 'Leyla' },
  { path: `${B}/gurme.svg`, label: 'Gurme' },
  { path: `${B}/muhabbet kuşu.svg`, label: 'Muhabbet Kuşu' },
  { path: `${B}/behzat ç.svg`, label: 'Behzat Ç' },
  { path: `${B}/JOKER.svg`, label: 'Joker' },
  // Dizi / Film Karakter Rozetleri
  { path: `${B}/BARNEY STİNSON.svg`, label: 'Barney Stinson' },
  { path: `${B}/CHANDLER BİİG.svg`, label: 'Chandler Bing' },
  { path: `${B}/SHELDON COOPER.svg`, label: 'Sheldon Cooper' },
  { path: `${B}/WALTER WHİTE.svg`, label: 'Walter White' },
  { path: `${B}/JON SNOW.svg`, label: 'Jon Snow' },
  { path: `${B}/SHERLOCK.svg`, label: 'Sherlock' },
  { path: `${B}/MR ROBOT.svg`, label: 'Mr. Robot' },
  { path: `${B}/PROFESSOR.svg`, label: 'Profesör' },
  { path: `${B}/THE DOCTOR.svg`, label: 'The Doctor' },
  { path: `${B}/TOKYO.svg`, label: 'Tokyo' },
  { path: `${B}/TOMMY SHELBY.svg`, label: 'Tommy Shelby' },
  { path: `${B}/RAGNAR LOTHBROK.svg`, label: 'Ragnar Lothbrok' },
  { path: `${B}/SPARTACUS.svg`, label: 'Spartacus' },
  { path: `${B}/DEXTER.svg`, label: 'Dexter' },
  { path: `${B}/ELEVEN.svg`, label: 'Eleven' },
  { path: `${B}/WEDNESDAY.svg`, label: 'Wednesday' },
  { path: `${B}/PABLO ESCOBAR.svg`, label: 'Pablo Escobar' },
  { path: `${B}/JESSE PİNKMAN.svg`, label: 'Jesse Pinkman' },
  { path: `${B}/DARK JONAS.svg`, label: 'Dark Jonas' },
  { path: `${B}/DEAN WİNCHESTER.svg`, label: 'Dean Winchester' },
  { path: `${B}/CASTİEL.svg`, label: 'Castiel' },
  { path: `${B}/CARRİE MATHİNSON.svg`, label: 'Carrie Mathison' },
  { path: `${B}/ELİZABETH.svg`, label: 'Elizabeth' },
  { path: `${B}/FRANK UNDERWOOD.svg`, label: 'Frank Underwood' },
  { path: `${B}/GOOD OMENS.svg`, label: 'Good Omens' },
  { path: `${B}/HANNİBAL.svg`, label: 'Hannibal' },
  { path: `${B}/HOUSE MD.svg`, label: 'House MD' },
  { path: `${B}/JOE.svg`, label: 'Joe' },
  { path: `${B}/JOHN LOCKE.svg`, label: 'John Locke' },
  { path: `${B}/KELLY AND YORKİE.svg`, label: 'Kelly & Yorkie' },
  { path: `${B}/KHALESİ.svg`, label: 'Khaleesi' },
  { path: `${B}/MARTHA.svg`, label: 'Martha' },
  { path: `${B}/MİCHAEL SCOLFİELD.svg`, label: 'Michael Scofield' },
  { path: `${B}/RİCK AND MORTY.svg`, label: 'Rick & Morty' },
  { path: `${B}/ROME JULİUS.svg`, label: 'Julius Caesar' },
  { path: `${B}/TYRİON LANNİSTER.svg`, label: 'Tyrion Lannister' },
  { path: `${B}/VİLLANEVİLLE.svg`, label: 'Villanelle' },
  { path: `${B}/THE OFFİCE.svg`, label: 'The Office' },
  { path: `${B}/THİS İS US.svg`, label: 'This is Us' },
  { path: `${B}/SAM WİNCHESTR.svg`, label: 'Sam Winchester' },
  { path: `${B}/WİTCHER GERALT.svg`, label: 'Witcher Geralt' },
];

const badgeIcons = badgeIconList.map(p => p.path);

export default function AdminBadgesPage() {
  const [badges, setBadges] = useState<BadgeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRarity, setFilterRarity] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<BadgeType | null>(null);
  const [iconSearch, setIconSearch] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: badgeIcons[0],
    category: 'general',
    rarity: 'COMMON' as BadgeType['rarity'],
    points: 100,
    requirement: '',
    isActive: true,
  });

  useEffect(() => {
    fetchBadges();
  }, []);

  const fetchBadges = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/gamification/badges');
      const data = await res.json();
      
      if (data.success) {
        setBadges(data.data);
      }
    } catch (error) {
      toast.error('Rozetler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const res = await fetch('/api/gamification/badges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      if (res.ok) {
        toast.success('Rozet oluşturuldu');
        setCreateDialogOpen(false);
        resetForm();
        fetchBadges();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Rozet oluşturulamadı');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const handleUpdate = async () => {
    if (!selectedBadge) return;
    
    try {
      const res = await fetch(`/api/gamification/badges/${selectedBadge.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      if (res.ok) {
        toast.success('Rozet güncellendi');
        setEditDialogOpen(false);
        setSelectedBadge(null);
        resetForm();
        fetchBadges();
      } else {
        toast.error('Rozet güncellenemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/gamification/badges/${id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        toast.success('Rozet silindi');
        fetchBadges();
      } else {
        toast.error('Rozet silinemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      icon: badgeIcons[0],
      category: 'general',
      rarity: 'COMMON',
      points: 100,
      requirement: '',
      isActive: true,
    });
    setIconSearch('');
  };

  const openEditDialog = (badge: BadgeType) => {
    setSelectedBadge(badge);
    setFormData({
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      category: badge.category || 'general',
      rarity: badge.rarity,
      points: badge.points,
      requirement: badge.requirement,
      isActive: badge.isActive,
    });
    setIconSearch('');
    setEditDialogOpen(true);
  };

  const filteredBadges = badges.filter((badge) => {
    const matchesSearch = badge.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRarity = filterRarity === 'all' || badge.rarity === filterRarity;
    return matchesSearch && matchesRarity;
  });

  // Stats
  const stats = {
    total: badges.length,
    legendary: badges.filter(b => b.rarity === 'LEGENDARY').length,
    epic: badges.filter(b => b.rarity === 'EPIC').length,
    rare: badges.filter(b => b.rarity === 'RARE').length,
    common: badges.filter(b => b.rarity === 'COMMON').length,
  };

  const BadgeForm = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Rozet Adı</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Örn: İlk Adım"
        />
      </div>
      <div className="space-y-2">
        <Label>Açıklama</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Rozet açıklaması..."
        />
      </div>
      <div className="space-y-2">
        <Label>İkon ({badgeIconList.length} rozet mevcut)</Label>
        <Input
          placeholder="İkon ara..."
          value={iconSearch}
          onChange={(e) => setIconSearch(e.target.value)}
          className="mb-2"
        />
        <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted/50 border border-border max-h-[280px] overflow-y-auto">
          {badgeIconList
            .filter(item => iconSearch === '' || item.label.toLowerCase().includes(iconSearch.toLowerCase()))
            .map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => setFormData({ ...formData, icon: item.path })}
              className={`p-2 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${
                formData.icon === item.path
                  ? 'border-primary bg-primary/10 scale-105 shadow-lg'
                  : 'border-transparent hover:border-primary/30 hover:bg-muted'
              }`}
              title={item.label}
            >
              <Image 
                src={item.path} 
                alt={item.label} 
                width={44} 
                height={44} 
                className="drop-shadow-lg" 
              />
              <span className="text-[10px] text-muted-foreground truncate w-14 text-center">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Kategori</Label>
          <Select
            value={formData.category}
            onValueChange={(value) => setFormData({ ...formData, category: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  <span className="flex items-center gap-2">
                    <cat.icon className="h-4 w-4 text-muted-foreground" />
                    {cat.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Nadirlik</Label>
          <Select
            value={formData.rarity}
            onValueChange={(value) => setFormData({ ...formData, rarity: value as BadgeType['rarity'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(rarityConfig).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <span className="flex items-center gap-2">
                    <config.icon className={`h-4 w-4 ${config.textColor}`} />
                    {config.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Puan Ödülü</Label>
          <Input
            type="number"
            value={formData.points}
            onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-2">
          <Label>Gereksinim</Label>
          <Input
            value={formData.requirement}
            onChange={(e) => setFormData({ ...formData, requirement: e.target.value })}
            placeholder="Örn: 10 geri bildirim gönder"
          />
        </div>
      </div>
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
        <Label>Aktif</Label>
        <Switch
          checked={formData.isActive}
          onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => {
          setCreateDialogOpen(false);
          setEditDialogOpen(false);
          resetForm();
        }}>
          İptal
        </Button>
        <Button onClick={onSubmit} className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
          {submitLabel}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Rozet Yönetimi"
        description="Gamification rozetlerini oluşturun ve yönetin"
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-card border border-border"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-muted">
              <Trophy className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Toplam</p>
            </div>
          </div>
        </motion.div>
        
        {Object.entries(rarityConfig).map(([key, config], index) => {
          const count = stats[key.toLowerCase() as keyof typeof stats] || 0;
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (index + 1) * 0.1 }}
              className={`p-4 rounded-xl ${config.bgGradient} border ${config.borderColor}`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${config.badgeBg}`}>
                  <config.icon className={`h-5 w-5 ${config.textColor}`} />
                </div>
                <div>
                  <p className="text-lg sm:text-2xl font-bold">{count}</p>
                  <p className={`text-xs ${config.textColor}`}>{config.label}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rozet ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterRarity} onValueChange={setFilterRarity}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filtrele" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tümü</SelectItem>
              {Object.entries(rarityConfig).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <span className="flex items-center gap-2">
                    <config.icon className={`h-4 w-4 ${config.textColor}`} />
                    {config.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-1 p-1 rounded-lg bg-muted border border-border">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white">
              <Plus className="h-4 w-4" />
              Yeni Rozet Oluştur
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                Yeni Rozet Oluştur
              </DialogTitle>
              <DialogDescription>
                Kullanıcıların kazanabileceği yeni bir rozet oluşturun. Özel rozetler için &quot;Özel&quot; kategorisini seçin.
              </DialogDescription>
            </DialogHeader>
            <BadgeForm onSubmit={handleCreate} submitLabel="Oluştur" />
          </DialogContent>
        </Dialog>
      </div>

      {/* Badges Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="p-8 rounded-2xl bg-card border">
              <div className="animate-pulse space-y-5">
                <div className="w-24 h-24 bg-muted rounded-full mx-auto" />
                <div className="h-5 bg-muted rounded w-3/4 mx-auto" />
                <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredBadges.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-16 rounded-2xl bg-card border text-center"
        >
          <Trophy className="h-20 w-20 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-foreground text-lg font-medium">Rozet bulunamadı</p>
          <p className="text-muted-foreground text-sm mt-1">Yeni bir rozet oluşturmaya başlayın</p>
        </motion.div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={viewMode}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={viewMode === 'grid' 
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" 
              : "space-y-3"
            }
          >
            {filteredBadges.map((badge, index) => {
              const config = rarityConfig[badge.rarity];
              const RarityIcon = config.icon;
              
              if (viewMode === 'list') {
                return (
                  <motion.div
                    key={badge.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className={`flex items-center gap-4 p-4 rounded-xl ${config.bgGradient} border ${config.borderColor} hover:scale-[1.01] transition-transform group`}
                  >
                    <div className="relative">
                      <div className="w-14 h-14 rounded-full bg-white overflow-hidden flex items-center justify-center">
                        <Image
                          src={badge.icon}
                          alt={badge.name}
                          width={62}
                          height={62}
                          className="scale-110"
                        />
                      </div>
                      {badge.rarity === 'LEGENDARY' && (
                        <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-amber-400 animate-pulse drop-shadow-[0_0_4px_rgba(251,191,36,0.5)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-foreground truncate">{badge.name}</h3>
                      <p className="text-sm text-muted-foreground truncate">{badge.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`${config.badgeBg} ${config.textColor} border-0`}>
                        <RarityIcon className="h-3 w-3 mr-1" />
                        {config.label}
                      </Badge>
                      <Badge variant="outline" className="gap-1 border-amber-400 text-amber-600 dark:text-amber-300">
                        <Star className="h-3 w-3" />
                        {badge.points}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      {badge._count?.userBadges || 0}
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(badge)} className="hover:bg-muted">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(badge.id)} className="hover:bg-destructive/10 text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={badge.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="group"
                >
                  <div className={`relative p-7 rounded-2xl ${config.bgGradient} border-2 ${config.borderColor} overflow-hidden transition-all duration-500 hover:scale-[1.03] hover:-translate-y-1.5 ${config.neonGlow} ${config.glowColor}`}>
                    
                    {/* ✨ Starfield / Space background (dark mode only) */}
                    <div className="absolute inset-0 hidden dark:block overflow-hidden rounded-2xl">
                      {[...Array(12)].map((_, i) => (
                        <div
                          key={i}
                          className="absolute w-[2px] h-[2px] bg-white rounded-full animate-pulse"
                          style={{
                            left: `${10 + (i * 7.5) % 85}%`,
                            top: `${8 + (i * 11.3) % 80}%`,
                            animationDelay: `${i * 0.3}s`,
                            animationDuration: `${2 + (i % 3)}s`,
                            opacity: 0.3 + (i % 4) * 0.15,
                          }}
                        />
                      ))}
                    </div>

                    {/* Animated glow for legendary */}
                    {badge.rarity === 'LEGENDARY' && (
                      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-orange-500/8 to-red-500/5 dark:from-amber-500/10 dark:via-orange-500/15 dark:to-red-500/10 animate-pulse rounded-2xl" />
                    )}
                    {badge.rarity === 'EPIC' && (
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/5 to-transparent dark:via-purple-500/8 animate-pulse rounded-2xl" />
                    )}
                    
                    {/* Top-right glow orb */}
                    <div className={`absolute -top-16 -right-16 w-36 h-36 rounded-full bg-gradient-to-br ${config.gradient} opacity-[0.06] dark:opacity-[0.12] blur-3xl`} />
                    <div className={`absolute -bottom-12 -left-12 w-28 h-28 rounded-full bg-gradient-to-br ${config.gradient} opacity-[0.04] dark:opacity-[0.08] blur-3xl`} />
                    
                    <div className="relative flex flex-col items-center text-center space-y-4">
                      {/* Badge Icon */}
                      <div className="relative">
                        <div className={`absolute -inset-3 rounded-full bg-gradient-to-br ${config.gradient} opacity-0 dark:opacity-15 blur-2xl`} />
                        <div className="relative w-36 h-36 rounded-full bg-white overflow-hidden flex items-center justify-center">
                          <Image
                            src={badge.icon}
                            alt={badge.name}
                            width={160}
                            height={160}
                            className="relative z-10 scale-110"
                          />
                        </div>

                        {/* Rarity sparkle effects */}
                        {badge.rarity === 'LEGENDARY' && (
                          <motion.div
                            className="absolute -top-1 -right-1 z-20"
                            animate={{ rotate: 360, scale: [1, 1.2, 1] }}
                            transition={{ rotate: { duration: 4, repeat: Infinity, ease: 'linear' }, scale: { duration: 1.5, repeat: Infinity } }}
                          >
                            <Sparkles className="h-7 w-7 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                          </motion.div>
                        )}
                        {badge.rarity === 'EPIC' && (
                          <motion.div
                            className="absolute -top-0.5 -right-0.5 z-20"
                            animate={{ scale: [1, 1.3, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          >
                            <Zap className="h-6 w-6 text-purple-500 dark:text-purple-300 drop-shadow-[0_0_6px_rgba(168,85,247,0.5)]" />
                          </motion.div>
                        )}
                        {badge.rarity === 'RARE' && (
                          <div className="absolute -top-0.5 -right-0.5 z-20">
                            <Gem className="h-5 w-5 text-cyan-500 dark:text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.5)]" />
                          </div>
                        )}
                      </div>

                      {/* Badge Info */}
                      <div className="space-y-2">
                        <h3 className="font-bold text-lg text-foreground tracking-tight">{badge.name}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{badge.description}</p>
                      </div>

                      {/* Rarity & Points */}
                      <div className="flex items-center gap-2">
                        <Badge className={`${config.badgeBg} ${config.textColor} border-0 font-medium px-3`}>
                          <RarityIcon className="h-3.5 w-3.5 mr-1" />
                          {config.label}
                        </Badge>
                        <Badge variant="outline" className="gap-1 border-amber-400/80 dark:border-amber-400/60 text-amber-600 dark:text-amber-300 font-medium px-3">
                          <Star className="h-3.5 w-3.5 fill-amber-400 dark:fill-amber-300" />
                          {badge.points}
                        </Badge>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>{badge._count?.userBadges || 0} kullanıcı kazandı</span>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditDialog(badge)}
                          className="dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/10"
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Düzenle
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 dark:bg-white/10 dark:hover:bg-red-500/20 dark:border-white/10"
                          onClick={() => handleDelete(badge.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Status indicator */}
                    {!badge.isActive && (
                      <div className="absolute top-3 right-3">
                        <Badge variant="outline" className="bg-muted/80 dark:bg-black/40 text-muted-foreground backdrop-blur-sm">
                          Pasif
                        </Badge>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-purple-500" />
              Rozet Düzenle
            </DialogTitle>
            <DialogDescription>
              {selectedBadge?.name} rozetini düzenleyin
            </DialogDescription>
          </DialogHeader>
          <BadgeForm onSubmit={handleUpdate} submitLabel="Güncelle" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
