'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart,
  Droplets,
  TreePine,
  GraduationCap,
  PawPrint,
  Stethoscope,
  Star,
  Sparkles,
  CheckCircle,
  Trophy,
  Target,
  Zap,
  Globe,
  Crown,
  Flame,
  ArrowRight,
  Play,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatNumber, getInitials, formatRelativeTime } from '@/lib/utils';

interface DonationProject {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  goal: number;
  current: number;
  impact: { unit: string; perPoint: number; label: string };
  tags: string[] | null;
  isFeatured: boolean;
  userDonation: number;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  image: string | null;
  level: number;
  totalPoints: number;
}

interface RecentDonation {
  id: string;
  userName: string | null;
  userImage: string | null;
  projectName: string;
  projectIcon: string;
  points: number;
  createdAt: string;
}

const categoryIcons: Record<string, React.ElementType> = {
  water: Droplets,
  environment: TreePine,
  education: GraduationCap,
  animals: PawPrint,
  health: Stethoscope,
};

const categoryLabels: Record<string, string> = {
  water: 'Temiz Su',
  environment: 'Çevre',
  education: 'Eğitim',
  animals: 'Hayvanlar',
  health: 'Sağlık',
};

const categoryGradients: Record<string, string> = {
  water: 'from-blue-500 to-cyan-500',
  environment: 'from-emerald-500 to-green-500',
  education: 'from-violet-500 to-purple-500',
  animals: 'from-amber-500 to-orange-500',
  health: 'from-rose-500 to-pink-500',
};

const categoryColors: Record<string, { bg: string; border: string; text: string; light: string }> = {
  water: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-500', light: 'bg-blue-500' },
  environment: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-500', light: 'bg-emerald-500' },
  education: { bg: 'bg-violet-500/10', border: 'border-violet-500/20', text: 'text-violet-500', light: 'bg-violet-500' },
  animals: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-500', light: 'bg-amber-500' },
  health: { bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-500', light: 'bg-rose-500' },
};

export default function CustomerDonationsPage() {
  const { data: session, update } = useSession();
  const [loading, setLoading] = useState(true);
  const [donating, setDonating] = useState(false);
  const [selectedProject, setSelectedProject] = useState<DonationProject | null>(null);
  const [donationAmount, setDonationAmount] = useState('');
  const [donationMessage, setDonationMessage] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');

  const [projects, setProjects] = useState<DonationProject[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [recentDonations, setRecentDonations] = useState<RecentDonation[]>([]);
  const [userStats, setUserStats] = useState({
    totalDonated: 0,
    donationCount: 0,
    rank: null as number | null,
    availablePoints: 0,
  });
  const [platformStats, setPlatformStats] = useState({
    totalDonated: 0,
    totalProjects: 0,
  });
  const [userImpacts, setUserImpacts] = useState<Array<{
    projectName: string;
    projectIcon: string;
    category: string;
    donated: number;
    impactValue: number;
    impactUnit: string;
    impactLabel: string;
  }>>([]);

  useEffect(() => {
    fetchData();
  }, [activeCategory]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/customer/donations?category=${activeCategory}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json();

      if (data.success) {
        setProjects(data.data.projects);
        setLeaderboard(data.data.leaderboard);
        setRecentDonations(data.data.recentDonations);
        setUserStats(data.data.userStats);
        setPlatformStats(data.data.platformStats);
        
        // Kullanıcının kişisel etkisini hesapla
        const impacts = data.data.projects
          .filter((p: DonationProject) => p.userDonation > 0)
          .map((p: DonationProject) => ({
            projectName: p.name,
            projectIcon: p.icon,
            category: p.category,
            donated: p.userDonation,
            impactValue: Math.floor(p.userDonation * (p.impact?.perPoint || 1)),
            impactUnit: p.impact?.unit || '',
            impactLabel: p.impact?.label || '',
          }));
        setUserImpacts(impacts);
      }
    } catch (error) {
      console.error('Failed to fetch donations:', error);
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleDonate = async () => {
    if (!selectedProject) return;

    const amount = parseInt(donationAmount);
    if (!amount || amount < 1) {
      toast.error('Geçerli bir miktar girin');
      return;
    }

    if (amount > userStats.availablePoints) {
      toast.error('Yetersiz puan');
      return;
    }

    setDonating(true);
    try {
      const res = await fetch('/api/customer/donations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          points: amount,
          message: donationMessage,
          isPublic,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success('Teşekkürler! Harika bir iş yaptın! 🎉', {
          description: `Senin sayende ${data.data.impact.value} ${data.data.impact.unit} ${data.data.impact.label}!`,
        });

        setUserStats(prev => ({
          ...prev,
          totalDonated: prev.totalDonated + amount,
          donationCount: prev.donationCount + 1,
          availablePoints: data.data.newBalance,
        }));

        await update({ points: data.data.newBalance });
        fetchData();
        setSelectedProject(null);
        setDonationAmount('');
        setDonationMessage('');
      } else {
        toast.error(data.error || 'Bağış yapılamadı');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    } finally {
      setDonating(false);
    }
  };

  const quickAmounts = [10, 50, 100, 250, 500];
  const featuredProjects = projects.filter(p => p.isFeatured);
  const regularProjects = projects.filter(p => !p.isFeatured);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-64 rounded-3xl bg-gradient-to-r from-violet-600/20 via-purple-600/20 to-fuchsia-600/20 animate-pulse" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl"
      >
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600" />
        
        {/* Animated orbs */}
        <div className="absolute top-10 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-fuchsia-400/20 rounded-full blur-3xl animate-pulse delay-1000" />
        
        {/* Content */}
        <div className="relative p-8 md:p-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="text-center md:text-left">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Badge className="mb-4 bg-white/20 text-white border-white/30 backdrop-blur-sm">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Sosyal Sorumluluk
                </Badge>
              </motion.div>
              
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-3xl md:text-5xl font-bold text-white mb-4"
              >
                Puanlarını{' '}
                <span className="bg-gradient-to-r from-yellow-300 to-orange-300 bg-clip-text text-transparent">
                  İyiliğe
                </span>{' '}
                Dönüştür
              </motion.h1>
              
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-white/80 text-lg max-w-md"
              >
                Her bağışınız gerçek bir etki yaratıyor. Projelerimize destek olarak dünyayı değiştirin.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="flex flex-wrap gap-3 mt-6 justify-center md:justify-start"
              >
                <Button size="lg" className="bg-white text-purple-600 hover:bg-white/90 gap-2 shadow-xl">
                  <Heart className="w-5 h-5" />
                  Hemen Bağış Yap
                </Button>
                <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 gap-2">
                  <Play className="w-5 h-5" />
                  Nasıl Çalışır?
                </Button>
              </motion.div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Star, label: 'Puanınız', value: formatNumber(userStats.availablePoints), delay: 0.4, color: 'from-yellow-400 to-amber-500' },
                { icon: Heart, label: 'Bağışınız', value: formatNumber(userStats.totalDonated), delay: 0.5, color: 'from-pink-400 to-rose-500' },
                { icon: Globe, label: 'Toplam Etki', value: formatNumber(platformStats.totalDonated), delay: 0.6, color: 'from-emerald-400 to-teal-500' },
                { icon: Trophy, label: 'Sıralamanız', value: userStats.rank ? `#${userStats.rank}` : '-', delay: 0.7, color: 'from-blue-400 to-indigo-500' },
              ].map((stat, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: stat.delay }}
                  className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 min-w-[140px]"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl bg-gradient-to-br ${stat.color} shadow-lg flex-shrink-0`}>
                      <stat.icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white/70 text-xs">{stat.label}</p>
                      <p className="text-xl font-bold text-white truncate">{stat.value}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Your Impact Section */}
      {userImpacts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl">Senin Etkin</CardTitle>
                  <CardDescription>Bağışlarınla yarattığın değişim</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {userImpacts.map((impact, idx) => {
                  const colors = categoryColors[impact.category] || categoryColors.water;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.1 }}
                      className={`relative p-4 rounded-xl ${colors.bg} border ${colors.border} overflow-hidden group hover:shadow-md transition-all`}
                    >
                      {/* Decorative gradient */}
                      <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${categoryGradients[impact.category]} opacity-10 rounded-full blur-2xl`} />
                      
                      <div className="relative">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-2xl">{impact.projectIcon}</span>
                          <span className="text-sm font-medium text-muted-foreground truncate">{impact.projectName}</span>
                        </div>
                        
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Senin sayende</p>
                          <p className={`text-3xl font-bold ${colors.text}`}>
                            {formatNumber(impact.impactValue)}
                          </p>
                          <p className="text-sm font-medium">{impact.impactUnit}</p>
                          <p className="text-xs text-muted-foreground">{impact.impactLabel}</p>
                        </div>

                        <div className="mt-3 pt-3 border-t border-border/50">
                          <p className="text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">{formatNumber(impact.donated)}</span> puan bağışladın
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Toplam Özet */}
              <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border border-violet-500/20">
                <div className="flex flex-wrap items-center justify-center gap-6 text-center">
                  <div>
                    <p className="text-3xl font-bold text-primary">{formatNumber(userStats.totalDonated)}</p>
                    <p className="text-sm text-muted-foreground">Toplam Puan</p>
                  </div>
                  <div className="hidden sm:block w-px h-12 bg-border" />
                  <div>
                    <p className="text-3xl font-bold text-primary">{userImpacts.length}</p>
                    <p className="text-sm text-muted-foreground">Desteklenen Proje</p>
                  </div>
                  <div className="hidden sm:block w-px h-12 bg-border" />
                  <div>
                    <p className="text-3xl font-bold text-primary">#{userStats.rank || '-'}</p>
                    <p className="text-sm text-muted-foreground">Liderlik Sırası</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Main Content */}
      <Tabs defaultValue="projects" className="space-y-8">
        <TabsList className="inline-flex h-14 items-center justify-center rounded-2xl bg-muted/50 p-1.5 backdrop-blur-sm">
          <TabsTrigger value="projects" className="rounded-xl px-6 py-3 gap-2 data-[state=active]:bg-background data-[state=active]:shadow-lg">
            <Target className="h-5 w-5" />
            Projeler
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="rounded-xl px-6 py-3 gap-2 data-[state=active]:bg-background data-[state=active]:shadow-lg">
            <Trophy className="h-5 w-5" />
            Liderlik
          </TabsTrigger>
          <TabsTrigger value="activity" className="rounded-xl px-6 py-3 gap-2 data-[state=active]:bg-background data-[state=active]:shadow-lg">
            <Zap className="h-5 w-5" />
            Aktivite
          </TabsTrigger>
        </TabsList>

        {/* Projects Tab */}
        <TabsContent value="projects" className="space-y-8">
          {/* Category Filter */}
          <div className="flex flex-wrap gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveCategory('all')}
              className={`px-5 py-2.5 rounded-xl font-medium transition-all ${
                activeCategory === 'all'
                  ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/30'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              Tümü
            </motion.button>
            {Object.entries(categoryLabels).map(([key, label]) => {
              const Icon = categoryIcons[key];
              return (
                <motion.button
                  key={key}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveCategory(key)}
                  className={`px-5 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 ${
                    activeCategory === key
                      ? `bg-gradient-to-r ${categoryGradients[key]} text-white shadow-lg`
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </motion.button>
              );
            })}
          </div>

          {/* Featured Projects */}
          {featuredProjects.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-yellow-500" />
                <h2 className="text-xl font-bold">Öne Çıkan Projeler</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                {featuredProjects.map((project, index) => (
                  <FeaturedProjectCard
                    key={project.id}
                    project={project}
                    index={index}
                    onDonate={() => setSelectedProject(project)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Regular Projects */}
          {regularProjects.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Tüm Projeler</h2>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {regularProjects.map((project, index) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    index={index}
                    onDonate={() => setSelectedProject(project)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {projects.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-20"
            >
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
                <Heart className="h-12 w-12 text-violet-500/50" />
              </div>
              <h3 className="text-xl font-semibold text-muted-foreground">Henüz proje yok</h3>
              <p className="text-muted-foreground mt-2">Yakında yeni projeler eklenecek</p>
            </motion.div>
          )}
        </TabsContent>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard">
          <LeaderboardSection leaderboard={leaderboard} currentUserId={session?.user?.id} />
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          <ActivitySection recentDonations={recentDonations} />
        </TabsContent>
      </Tabs>

      {/* Donation Dialog */}
      <DonationDialog
        project={selectedProject}
        isOpen={!!selectedProject}
        onClose={() => setSelectedProject(null)}
        userPoints={userStats.availablePoints}
        donationAmount={donationAmount}
        setDonationAmount={setDonationAmount}
        donationMessage={donationMessage}
        setDonationMessage={setDonationMessage}
        isPublic={isPublic}
        setIsPublic={setIsPublic}
        onDonate={handleDonate}
        donating={donating}
        quickAmounts={quickAmounts}
      />
    </div>
  );
}

// Featured Project Card Component
function FeaturedProjectCard({ 
  project, 
  index, 
  onDonate 
}: { 
  project: DonationProject; 
  index: number; 
  onDonate: () => void;
}) {
  const Icon = categoryIcons[project.category] || Heart;
  const colors = categoryColors[project.category] || categoryColors.water;
  const progress = (project.current / project.goal) * 100;
  const impactValue = Math.floor(project.current * (project.impact?.perPoint || 1));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      whileHover={{ y: -4 }}
      className="group h-full"
    >
      <Card className={`relative overflow-hidden h-full border ${colors.border} bg-card hover:shadow-xl transition-all duration-300`}>
        {/* Top gradient accent */}
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${categoryGradients[project.category]}`} />
        
        {/* Featured badge */}
        <div className="absolute top-4 right-4 z-10">
          <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white border-0 shadow-md">
            <Sparkles className="w-3 h-3 mr-1" />
            Öne Çıkan
          </Badge>
        </div>

        <CardContent className="p-6 flex flex-col h-full">
          {/* Header */}
          <div className="flex items-start gap-4 mb-4">
            <div className={`flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br ${categoryGradients[project.category]} flex items-center justify-center text-3xl shadow-lg`}>
              {project.icon}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <h3 className="text-lg font-bold mb-1 pr-20">{project.name}</h3>
              <Badge variant="outline" className={`text-xs ${colors.text} ${colors.border}`}>
                <Icon className="w-3 h-3 mr-1" />
                {categoryLabels[project.category]}
              </Badge>
            </div>
          </div>

          {/* Description */}
          <p className="text-muted-foreground text-sm line-clamp-2 mb-4 min-h-[40px]">
            {project.description}
          </p>

          {/* Impact Stats */}
          <div className={`grid grid-cols-2 gap-3 p-3 rounded-xl ${colors.bg} mb-4`}>
            <div className="text-center">
              <p className={`text-2xl font-bold ${colors.text}`}>{formatNumber(impactValue)}</p>
              <p className="text-xs text-muted-foreground">{project.impact?.unit}</p>
            </div>
            <div className="text-center border-l border-border">
              <p className={`text-2xl font-bold ${colors.text}`}>%{Math.min(progress, 100).toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">tamamlandı</p>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-2 mb-4">
            <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(progress, 100)}%` }}
                transition={{ duration: 1, delay: 0.5 }}
                className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${categoryGradients[project.category]}`}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatNumber(project.current)} puan toplandı</span>
              <span>Hedef: {formatNumber(project.goal)}</span>
            </div>
          </div>

          {/* User contribution - Kişisel Etki */}
          {project.userDonation > 0 && (
            <div className={`p-3 rounded-lg ${colors.bg} ${colors.border} border mb-4`}>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className={`h-4 w-4 ${colors.text}`} />
                <span className="text-xs text-muted-foreground">Senin katkın</span>
              </div>
              <p className={`text-sm font-bold ${colors.text}`}>
                {formatNumber(Math.floor(project.userDonation * (project.impact?.perPoint || 1)))} {project.impact?.unit}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatNumber(project.userDonation)} puan ile sağladın
              </p>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-grow" />

          {/* Donate Button */}
          <Button
            className={`w-full gap-2 bg-gradient-to-r ${categoryGradients[project.category]} hover:opacity-90 text-white shadow-md`}
            size="lg"
            onClick={onDonate}
            disabled={progress >= 100}
          >
            <Heart className="h-4 w-4" />
            {progress >= 100 ? 'Hedef Tamamlandı' : 'Bağış Yap'}
            {progress < 100 && <ArrowRight className="h-4 w-4" />}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Regular Project Card Component
function ProjectCard({ 
  project, 
  index, 
  onDonate 
}: { 
  project: DonationProject; 
  index: number; 
  onDonate: () => void;
}) {
  const Icon = categoryIcons[project.category] || Heart;
  const colors = categoryColors[project.category] || categoryColors.water;
  const progress = (project.current / project.goal) * 100;
  const impactValue = Math.floor(project.current * (project.impact?.perPoint || 1));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ y: -4 }}
      className="group h-full"
    >
      <Card className={`relative overflow-hidden h-full border ${colors.border} bg-card hover:shadow-lg transition-all duration-300`}>
        {/* Top gradient accent */}
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${categoryGradients[project.category]}`} />
        
        <CardContent className="p-5 flex flex-col h-full">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${categoryGradients[project.category]} flex items-center justify-center text-xl shadow-md group-hover:scale-105 transition-transform`}>
              {project.icon}
            </div>
            <Badge variant="outline" className={`text-xs ${colors.text} ${colors.border}`}>
              <Icon className="w-3 h-3 mr-1" />
              {categoryLabels[project.category]}
            </Badge>
          </div>

          {/* Content */}
          <h3 className="text-base font-bold mb-2">{project.name}</h3>
          <p className="text-muted-foreground text-sm line-clamp-2 mb-4 min-h-[40px]">
            {project.description}
          </p>

          {/* Impact Stats */}
          <div className={`flex items-center justify-between p-3 rounded-lg ${colors.bg} mb-4`}>
            <div>
              <p className={`text-xl font-bold ${colors.text}`}>{formatNumber(impactValue)}</p>
              <p className="text-xs text-muted-foreground">{project.impact?.unit}</p>
            </div>
            <div className="text-right">
              <p className={`text-lg font-bold ${colors.text}`}>%{Math.min(progress, 100).toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">tamamlandı</p>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-1.5 mb-4">
            <div className="relative h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(progress, 100)}%` }}
                transition={{ duration: 1, delay: 0.3 }}
                className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${categoryGradients[project.category]}`}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {formatNumber(project.current)} / {formatNumber(project.goal)} puan
            </p>
          </div>

          {/* Spacer */}
          <div className="flex-grow" />

          {/* Button */}
          <Button
            className={`w-full gap-2 bg-gradient-to-r ${categoryGradients[project.category]} hover:opacity-90 text-white`}
            onClick={onDonate}
            disabled={progress >= 100}
          >
            <Heart className="h-4 w-4" />
            {progress >= 100 ? 'Tamamlandı' : 'Bağış Yap'}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Leaderboard Section Component
function LeaderboardSection({ 
  leaderboard, 
  currentUserId 
}: { 
  leaderboard: LeaderboardEntry[]; 
  currentUserId?: string;
}) {
  if (leaderboard.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-20"
      >
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center">
          <Trophy className="h-12 w-12 text-yellow-500/50" />
        </div>
        <h3 className="text-xl font-semibold text-muted-foreground">Henüz bağış yapılmamış</h3>
        <p className="text-muted-foreground mt-2">İlk bağışı yaparak lider olun!</p>
      </motion.div>
    );
  }

  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  return (
    <div className="space-y-8">
      {/* Podium */}
      {top3.length >= 3 && (
        <div className="flex items-end justify-center gap-4 pt-8">
          {/* 2nd Place */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="w-36"
          >
            <div className="text-center">
              <div className="relative inline-block mb-3">
                <Avatar className="w-20 h-20 ring-4 ring-gray-400">
                  <AvatarImage src={top3[1]?.image || ''} />
                  <AvatarFallback className="bg-gray-500 text-white text-xl">
                    {getInitials(top3[1]?.name || '')}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white font-bold shadow-lg">
                  2
                </div>
              </div>
              <p className="font-bold truncate">{top3[1]?.name}</p>
              <p className="text-sm text-muted-foreground">{formatNumber(top3[1]?.totalPoints || 0)} puan</p>
            </div>
            <div className="h-24 mt-4 rounded-t-2xl bg-gradient-to-t from-gray-400/50 to-gray-300/30" />
          </motion.div>

          {/* 1st Place */}
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.1, type: 'spring' }}
            className="w-44"
          >
            <div className="text-center">
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Crown className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
              </motion.div>
              <div className="relative inline-block mb-3">
                <Avatar className="w-28 h-28 ring-4 ring-yellow-400">
                  <AvatarImage src={top3[0]?.image || ''} />
                  <AvatarFallback className="bg-yellow-500 text-white text-2xl">
                    {getInitials(top3[0]?.name || '')}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center text-white font-bold shadow-lg">
                  1
                </div>
              </div>
              <p className="font-bold text-lg truncate">{top3[0]?.name}</p>
              <p className="text-primary font-semibold">{formatNumber(top3[0]?.totalPoints || 0)} puan</p>
            </div>
            <div className="h-32 mt-4 rounded-t-2xl bg-gradient-to-t from-yellow-500/50 to-yellow-300/30" />
          </motion.div>

          {/* 3rd Place */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="w-36"
          >
            <div className="text-center">
              <div className="relative inline-block mb-3">
                <Avatar className="w-20 h-20 ring-4 ring-amber-600">
                  <AvatarImage src={top3[2]?.image || ''} />
                  <AvatarFallback className="bg-amber-600 text-white text-xl">
                    {getInitials(top3[2]?.name || '')}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-amber-600 flex items-center justify-center text-white font-bold shadow-lg">
                  3
                </div>
              </div>
              <p className="font-bold truncate">{top3[2]?.name}</p>
              <p className="text-sm text-muted-foreground">{formatNumber(top3[2]?.totalPoints || 0)} puan</p>
            </div>
            <div className="h-16 mt-4 rounded-t-2xl bg-gradient-to-t from-amber-600/50 to-amber-400/30" />
          </motion.div>
        </div>
      )}

      {/* Rest of leaderboard */}
      {rest.length > 0 && (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {rest.map((entry, index) => (
              <motion.div
                key={entry.userId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors ${
                  entry.userId === currentUserId ? 'bg-primary/5' : ''
                }`}
              >
                <div className="w-10 text-center font-bold text-muted-foreground">
                  #{entry.rank}
                </div>
                <Avatar>
                  <AvatarImage src={entry.image || ''} />
                  <AvatarFallback>{getInitials(entry.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-medium">
                    {entry.name}
                    {entry.userId === currentUserId && (
                      <Badge variant="secondary" className="ml-2 text-xs">Siz</Badge>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">Seviye {entry.level}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary">{formatNumber(entry.totalPoints)}</p>
                  <p className="text-xs text-muted-foreground">puan</p>
                </div>
              </motion.div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Activity Section Component
function ActivitySection({ recentDonations }: { recentDonations: RecentDonation[] }) {
  if (recentDonations.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-20"
      >
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
          <Zap className="h-12 w-12 text-violet-500/50" />
        </div>
        <h3 className="text-xl font-semibold text-muted-foreground">Henüz aktivite yok</h3>
        <p className="text-muted-foreground mt-2">İlk bağışı yaparak başlayın!</p>
      </motion.div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          Canlı Aktivite
        </CardTitle>
        <CardDescription>Topluluğun son bağışları</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {recentDonations.map((donation, index) => (
          <motion.div
            key={donation.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <Avatar>
              <AvatarImage src={donation.userImage || ''} />
              <AvatarFallback>{getInitials(donation.userName || 'A')}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-semibold">{donation.userName || 'Anonim'}</span>
                {' '}
                <span className="text-primary font-bold">{formatNumber(donation.points)} puan</span>
                {' bağışladı'}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <span>{donation.projectIcon}</span>
                {donation.projectName}
              </p>
            </div>
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              {formatRelativeTime(donation.createdAt)}
            </p>
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
}

// Donation Dialog Component
function DonationDialog({
  project,
  isOpen,
  onClose,
  userPoints,
  donationAmount,
  setDonationAmount,
  donationMessage,
  setDonationMessage,
  isPublic,
  setIsPublic,
  onDonate,
  donating,
  quickAmounts,
}: {
  project: DonationProject | null;
  isOpen: boolean;
  onClose: () => void;
  userPoints: number;
  donationAmount: string;
  setDonationAmount: (value: string) => void;
  donationMessage: string;
  setDonationMessage: (value: string) => void;
  isPublic: boolean;
  setIsPublic: (value: boolean) => void;
  onDonate: () => void;
  donating: boolean;
  quickAmounts: number[];
}) {
  if (!project) return null;

  const amount = parseInt(donationAmount) || 0;
  const impactValue = Math.floor(amount * (project.impact?.perPoint || 1));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${categoryGradients[project.category]} flex items-center justify-center text-2xl`}>
              {project.icon}
            </div>
            <div>
              <p className="text-lg">{project.name}</p>
              <p className="text-sm font-normal text-muted-foreground">Bağış Yap</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Quick Amounts */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Hızlı Seçim</Label>
            <div className="flex flex-wrap gap-2">
              {quickAmounts.map((amt) => (
                <motion.button
                  key={amt}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setDonationAmount(String(amt))}
                  disabled={amt > userPoints}
                  className={`px-4 py-2 rounded-xl font-medium transition-all ${
                    donationAmount === String(amt)
                      ? `bg-gradient-to-r ${categoryGradients[project.category]} text-white shadow-lg`
                      : 'bg-muted hover:bg-muted/80 disabled:opacity-50'
                  }`}
                >
                  {amt}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Custom Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Miktar</Label>
            <div className="relative">
              <Input
                id="amount"
                type="number"
                placeholder="Bağış miktarı..."
                value={donationAmount}
                onChange={(e) => setDonationAmount(e.target.value)}
                min={1}
                max={userPoints}
                className="text-lg pr-16"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                puan
              </span>
            </div>
            <p className="text-xs text-muted-foreground flex justify-between">
              <span>Mevcut: {formatNumber(userPoints)} puan</span>
              {amount > userPoints && <span className="text-destructive">Yetersiz puan</span>}
            </p>
          </div>

          {/* Impact Preview - Senin Etkin */}
          {amount > 0 && amount <= userPoints && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`p-4 rounded-xl ${categoryColors[project.category]?.bg || 'bg-primary/10'} border ${categoryColors[project.category]?.border || 'border-primary/20'}`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${categoryGradients[project.category]}`}>
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Senin sayende sağlanacak</p>
                  <p className={`text-2xl font-bold ${categoryColors[project.category]?.text || 'text-primary'}`}>
                    {formatNumber(impactValue)} {project.impact?.unit}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{project.impact?.label}</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Mesaj (Opsiyonel)</Label>
            <Textarea
              id="message"
              placeholder="Bir mesaj bırakın..."
              value={donationMessage}
              onChange={(e) => setDonationMessage(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Public Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
            <div>
              <Label htmlFor="public" className="font-medium">Herkese Açık</Label>
              <p className="text-xs text-muted-foreground">
                Bağışınız aktivite akışında görünsün
              </p>
            </div>
            <Switch
              id="public"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            İptal
          </Button>
          <Button
            onClick={onDonate}
            disabled={donating || !amount || amount < 1 || amount > userPoints}
            className={`gap-2 bg-gradient-to-r ${categoryGradients[project.category]} hover:opacity-90`}
          >
            {donating ? (
              'İşleniyor...'
            ) : (
              <>
                <Heart className="h-4 w-4" />
                Bağışla
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
