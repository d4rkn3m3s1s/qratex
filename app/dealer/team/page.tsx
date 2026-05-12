'use client';

import { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  ClipboardList,
  Calendar,
  BookOpen,
  ListChecks,
  Send,
  Loader2,
  UserPlus,
  Mail,
  Briefcase,
  KeyRound,
  Edit2,
  Trash2,
  Power,
  Save,
} from 'lucide-react';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/lib/admin-toast';
import { formatDate } from '@/lib/utils';
import { useAppLocale, useAppT } from '@/lib/app-locale';

interface StaffMember {
  id: string;
  userId: string;
  jobTitle: string | null;
  pinCode: string | null;
  isActive: boolean;
  createdAt: string;
  user: { id: string; name: string | null; email: string; image: string | null };
}

export default function DealerTeamPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const dateLocale = locale === 'tr' ? 'tr' : 'en';
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [trainingModules, setTrainingModules] = useState<any[]>([]);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    password: '',
    jobTitle: '',
    pinCode: '',
  });
  const [addLoading, setAddLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<{ id: string; jobTitle: string; pinCode: string; isActive: boolean }>({
    id: '', jobTitle: '', pinCode: '', isActive: true
  });
  const [editLoading, setEditLoading] = useState(false);

  const fetchStaff = async () => {
    const res = await fetch('/api/dealer/staff');
    const json = await res.json();
    if (json.success) setStaff(json.staff ?? []);
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchStaff(),
        fetch('/api/dealer/staff/tasks').then((r) => r.json()).then((j) => j.success && setTasks(j.tasks ?? [])),
        fetch('/api/dealer/staff/shifts').then((r) => r.json()).then((j) => j.success && setShifts(j.shifts ?? [])),
        fetch('/api/dealer/staff/leave').then((r) => r.json()).then((j) => j.success && setLeaveRequests(j.requests ?? [])),
        fetch('/api/dealer/staff/training').then((r) => r.json()).then((j) => j.success && setTrainingModules(j.modules ?? [])),
        fetch('/api/dealer/staff/checklists').then((r) => r.json()).then((j) => j.success && setChecklists(j.templates ?? [])),
      ]);
    } catch {
      toast.error(t('dealerTeam.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleAddStaff = async () => {
    if (!addForm.name.trim() || !addForm.email.trim() || !addForm.password || addForm.password.length < 8) {
      toast.error(t('dealerTeam.toastAddValidation'));
      return;
    }
    setAddLoading(true);
    try {
      const res = await fetch('/api/dealer/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name.trim(),
          email: addForm.email.trim(),
          password: addForm.password,
          jobTitle: addForm.jobTitle.trim() || undefined,
          pinCode: addForm.pinCode.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(t('dealerTeam.toastAdded'));
        setAddOpen(false);
        setAddForm({ name: '', email: '', password: '', jobTitle: '', pinCode: '' });
        fetchStaff();
      } else {
        toast.error(json.error ?? t('dealerTeam.toastAddFailed'));
      }
    } catch {
      toast.error(t('dealerTeam.toastOpFailed'));
    } finally {
      setAddLoading(false);
    }
  };

  const handleEditStaff = async () => {
    setEditLoading(true);
    try {
      const res = await fetch(`/api/dealer/staff/${editForm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: editForm.jobTitle.trim() || null,
          pinCode: editForm.pinCode.trim() || null,
          isActive: editForm.isActive,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(t('dealerTeam.toastUpdated'));
        setEditOpen(false);
        fetchStaff();
      } else {
        toast.error(json.error ?? t('dealerTeam.toastUpdateFailed'));
      }
    } catch {
      toast.error(t('dealerTeam.toastOpFailed'));
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <DashboardPageHeading
        title={t('dealerTeam.title')}
        description={t('dealerTeam.description')}
        actions={
          <Button onClick={() => setAddOpen(true)} className="gap-2 touch-manipulation shrink-0">
            <UserPlus className="h-4 w-4 shrink-0" />
            {t('dealerTeam.addStaff')}
          </Button>
        }
      />

      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 shadow-sm sm:hidden">
        <h1 className="text-xl font-bold tracking-tight text-balance">{t('dealerTeam.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1 text-pretty leading-relaxed">
          {t('dealerTeam.description')}
        </p>
      </div>

      <Tabs defaultValue="staff" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="staff" className="gap-1">
            <Users className="h-4 w-4 shrink-0" />
            {t('dealerTeam.tabStaff').replace('{count}', String(staff.length))}
          </TabsTrigger>
          <TabsTrigger value="tasks">{t('dealerTeam.tabTasks')}</TabsTrigger>
          <TabsTrigger value="shifts">{t('dealerTeam.tabShifts')}</TabsTrigger>
          <TabsTrigger value="leave">{t('dealerTeam.tabLeave')}</TabsTrigger>
          <TabsTrigger value="training">{t('dealerTeam.tabTraining')}</TabsTrigger>
          <TabsTrigger value="checklists">{t('dealerTeam.tabChecklists')}</TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="space-y-4">
          {loading ? (
            <InlineLoadingStatus className="py-12" label={t('dealerTeam.loadingTeam')} />
          ) : staff.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('dealerTeam.emptyStaff')}</p>
                <Button className="mt-4" onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('dealerTeam.addStaff')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {staff.map((s) => (
                <Card key={s.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate flex items-center gap-2">
                          {s.user.name ?? s.user.email}
                          {!s.isActive && <Badge variant="destructive" className="text-[10px] h-4 px-1">{t('dealerTeam.badgeInactive')}</Badge>}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">{s.user.email}</p>
                        {s.jobTitle && (
                          <Badge variant="outline" className="mt-1 text-xs">{s.jobTitle}</Badge>
                        )}
                      </div>
                      <div className="flex bg-muted/50 rounded-lg p-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-background"
                          onClick={() => {
                            setEditForm({
                              id: s.id,
                              jobTitle: s.jobTitle || '',
                              pinCode: s.pinCode || '',
                              isActive: s.isActive,
                            });
                            setEditOpen(true);
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('dealerTeam.tasksTitle')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('dealerTeam.tasksDescription')}
              </p>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('dealerTeam.tasksEmpty')}</p>
              ) : (
                <ul className="space-y-2">
                  {tasks.map((task) => (
                    <li key={task.id} className="flex justify-between items-center py-2 border-b last:border-0">
                      <span className="font-medium">{task.title}</span>
                      <Badge variant={task.status === 'completed' ? 'secondary' : 'default'}>{task.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shifts">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('dealerTeam.shiftsTitle')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('dealerTeam.shiftsDescription')}
              </p>
            </CardHeader>
            <CardContent>
              {shifts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('dealerTeam.shiftsEmpty')}</p>
              ) : (
                <ul className="space-y-2">
                  {shifts.slice(0, 20).map((s) => (
                    <li key={s.id} className="flex justify-between items-center py-2 border-b last:border-0 text-sm">
                      <span>{s.user?.name ?? s.userId}</span>
                      <span>{formatDate(s.date, undefined, dateLocale)} · {s.startTime}–{s.endTime}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('dealerTeam.leaveTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {leaveRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('dealerTeam.leaveEmpty')}</p>
              ) : (
                <ul className="space-y-2">
                  {leaveRequests.map((r) => (
                    <li key={r.id} className="flex justify-between items-center py-2 border-b last:border-0 text-sm">
                      <span>{r.user?.name ?? r.userId}</span>
                      <span>{formatDate(r.startDate, undefined, dateLocale)} – {formatDate(r.endDate, undefined, dateLocale)}</span>
                      <Badge variant={r.status === 'pending' ? 'secondary' : r.status === 'approved' ? 'default' : 'destructive'}>
                        {r.status === 'pending' && t('dealerTeam.leavePending')}
                        {r.status === 'approved' && t('dealerTeam.leaveApproved')}
                        {r.status === 'rejected' && t('dealerTeam.leaveRejected')}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="training">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('dealerTeam.trainingTitle')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('dealerTeam.trainingDescription')}
              </p>
            </CardHeader>
            <CardContent>
              {trainingModules.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('dealerTeam.trainingEmpty')}</p>
              ) : (
                <ul className="space-y-2">
                  {trainingModules.map((m) => (
                    <li key={m.id} className="py-2 border-b last:border-0">
                      <p className="font-medium">{m.title}</p>
                      {m.description && <p className="text-sm text-muted-foreground">{m.description}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checklists">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('dealerTeam.checklistsTitle')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('dealerTeam.checklistsDescription')}
              </p>
            </CardHeader>
            <CardContent>
              {checklists.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('dealerTeam.checklistsEmpty')}</p>
              ) : (
                <ul className="space-y-2">
                  {checklists.map((c) => (
                    <li key={c.id} className="py-2 border-b last:border-0">
                      <p className="font-medium">{c.title}</p>
                      <p className="text-xs text-muted-foreground">{c.type}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dealerTeam.dialogAddTitle')}</DialogTitle>
            <DialogDescription>
              {t('dealerTeam.dialogAddDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('dealerTeam.labelName')}</Label>
              <Input
                value={addForm.name}
                onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                placeholder={t('dealerTeam.placeholderName')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('dealerTeam.labelEmail')}</Label>
              <Input
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
                placeholder={t('dealerTeam.placeholderEmail')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('dealerTeam.labelPassword')}</Label>
              <Input
                type="password"
                value={addForm.password}
                onChange={(e) => setAddForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('dealerTeam.labelJobTitle')}</Label>
              <Input
                value={addForm.jobTitle}
                onChange={(e) => setAddForm((p) => ({ ...p, jobTitle: e.target.value }))}
                placeholder={t('dealerTeam.placeholderJobTitle')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('dealerTeam.labelPin')}</Label>
              <Input
                value={addForm.pinCode}
                onChange={(e) => setAddForm((p) => ({ ...p, pinCode: e.target.value }))}
                placeholder={t('dealerTeam.placeholderPin')}
                maxLength={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleAddStaff} disabled={addLoading}>
              {addLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              {t('dealerTeam.submitAdd')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dealerTeam.dialogEditTitle')}</DialogTitle>
            <DialogDescription>
              {t('dealerTeam.dialogEditDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('dealerTeam.labelRole')}</Label>
              <Input
                value={editForm.jobTitle}
                onChange={(e) => setEditForm((p) => ({ ...p, jobTitle: e.target.value }))}
                placeholder={t('dealerTeam.placeholderJobTitle')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('dealerTeam.labelPinEdit')}</Label>
              <Input
                value={editForm.pinCode}
                onChange={(e) => setEditForm((p) => ({ ...p, pinCode: e.target.value }))}
                placeholder={t('dealerTeam.placeholderPin')}
                maxLength={6}
              />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-xl bg-muted/30">
              <div className="space-y-0.5">
                <Label>{t('dealerTeam.sectionActiveStaff')}</Label>
                <p className="text-xs text-muted-foreground">{t('dealerTeam.sectionActiveHint')}</p>
              </div>
              <Button
                variant={editForm.isActive ? 'default' : 'destructive'}
                size="sm"
                onClick={() => setEditForm(p => ({ ...p, isActive: !p.isActive }))}
                className="gap-2"
              >
                <Power className="h-3 w-3" />
                {editForm.isActive ? t('dealerTeam.stateActive') : t('dealerTeam.stateInactive')}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleEditStaff} disabled={editLoading}>
              {editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
