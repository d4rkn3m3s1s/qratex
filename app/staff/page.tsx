'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  ClipboardList,
  Calendar,
  BookOpen,
  ListChecks,
  Clock,
  LogIn,
  LogOut,
  Send,
  Check,
  Loader2,
  User,
  Radio,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { useAppLocale, useAppT } from '@/lib/app-locale';

interface DashboardData {
  profile: { jobTitle: string | null; dealer: { name: string | null; businessName: string | null } } | null;
  tasks: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    dueAt: string | null;
    completedAt: string | null;
  }>;
  shifts: Array<{
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    clockInAt: string | null;
    clockOutAt: string | null;
  }>;
  leaveRequests: Array<{
    id: string;
    startDate: string;
    endDate: string;
    reason: string | null;
    status: string;
  }>;
  trainingModules: Array<{ id: string; title: string; description: string | null; completed: boolean }>;
  checklistTemplates: Array<{ id: string; type: string; title: string }>;
}

export default function StaffDashboard() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const timeLocale = locale === 'en' ? 'en-US' : 'tr-TR';
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/staff/me');
      const json = await res.json();
      if (json.success) {
        setData({
          profile: json.profile,
          tasks: json.tasks ?? [],
          shifts: json.shifts ?? [],
          leaveRequests: json.leaveRequests ?? [],
          trainingModules: json.trainingModules ?? [],
          checklistTemplates: json.checklistTemplates ?? [],
        });
      } else {
        toast.error(json.error ?? t('staffDashboard.toastDataLoadFailed'));
      }
    } catch {
      toast.error(t('staffDashboard.toastConnectionError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleTaskStatus = async (taskId: string, status: string) => {
    setActioning(taskId);
    try {
      const res = await fetch(`/api/staff/tasks?id=${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(status === 'completed' ? t('staffDashboard.toastTaskCompleted') : t('staffDashboard.toastUpdated'));
        fetchData();
      } else {
        toast.error(json.error ?? t('staffDashboard.toastOperationFailed'));
      }
    } catch {
      toast.error(t('staffDashboard.toastOperationFailed'));
    } finally {
      setActioning(null);
    }
  };

  const handleClock = async (shiftId: string, action: 'clock_in' | 'clock_out') => {
    setActioning(shiftId);
    try {
      const res = await fetch('/api/staff/shifts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId, action }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(action === 'clock_in' ? t('staffDashboard.toastClockIn') : t('staffDashboard.toastClockOut'));
        fetchData();
      } else {
        toast.error(json.error ?? t('staffDashboard.toastOperationFailed'));
      }
    } catch {
      toast.error(t('staffDashboard.toastOperationFailed'));
    } finally {
      setActioning(null);
    }
  };

  const handleCompleteTraining = async (moduleId: string) => {
    setActioning(moduleId);
    try {
      const res = await fetch('/api/staff/training/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(t('staffDashboard.toastModuleCompleted'));
        fetchData();
      } else {
        toast.error(json.error ?? t('staffDashboard.toastOperationFailed'));
      }
    } catch {
      toast.error(t('staffDashboard.toastOperationFailed'));
    } finally {
      setActioning(null);
    }
  };

  if (loading && !data) {
    return (
      <InlineLoadingStatus className="min-h-[50vh]" label={t('staffDashboard.loadingPanel')} />
    );
  }

  const businessName = data?.profile?.dealer?.businessName ?? data?.profile?.dealer?.name ?? t('staffDashboard.fallbackBusiness');
  const today = new Date().toISOString().slice(0, 10);
  const todayShift = data?.shifts?.find((s) => s.date.slice(0, 10) === today);
  const openTaskCount = data?.tasks?.filter((task) => task.status !== 'completed').length ?? 0;

  const taskStatusLabel = (status: string) => {
    if (status === 'pending') return t('staffDashboard.taskPending');
    if (status === 'in_progress') return t('staffDashboard.taskInProgress');
    if (status === 'completed') return t('staffDashboard.taskCompleted');
    if (status === 'cancelled') return t('staffDashboard.taskCancelled');
    return status;
  };

  const leaveStatusLabel = (status: string) => {
    if (status === 'pending') return t('staffDashboard.leavePending');
    if (status === 'approved') return t('staffDashboard.leaveApproved');
    if (status === 'rejected') return t('staffDashboard.leaveRejected');
    return status;
  };

  const checklistTypeLabel = (type: string) => {
    if (type === 'open') return t('staffDashboard.checklistTypeOpen');
    if (type === 'close') return t('staffDashboard.checklistTypeClose');
    if (type === 'custom') return t('staffDashboard.checklistTypeCustom');
    return type;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-balance">{t('staffDashboard.welcomeTitle')}</h1>
          <p className="text-muted-foreground mt-1.5 text-pretty leading-relaxed">
            {businessName} · {t('staffDashboard.staffPanelSuffix')}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="w-fit shrink-0 touch-manipulation">
          <Link href="/staff/field">
            <Radio className="h-4 w-4 shrink-0 mr-2" />
            {t('staffDashboard.fieldMode')}
          </Link>
        </Button>
      </div>

      {todayShift && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0" />
              {t('staffDashboard.todayShift')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <span className="text-muted-foreground">
              {todayShift.startTime} – {todayShift.endTime}
            </span>
            {!todayShift.clockInAt ? (
              <Button
                size="sm"
                onClick={() => handleClock(todayShift.id, 'clock_in')}
                disabled={!!actioning}
              >
                {actioning === todayShift.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4 mr-1" />
                )}
                {t('staffDashboard.clockIn')}
              </Button>
            ) : !todayShift.clockOutAt ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleClock(todayShift.id, 'clock_out')}
                disabled={!!actioning}
              >
                {actioning === todayShift.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4 mr-1" />
                )}
                {t('staffDashboard.clockOut')}
              </Button>
            ) : (
              <Badge variant="secondary">{t('staffDashboard.completed')}</Badge>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="tasks" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto gap-1 p-1 min-h-11">
          <TabsTrigger value="tasks" className="gap-1 sm:gap-2 text-xs sm:text-sm py-2.5 px-2">
            <ClipboardList className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {t('staffDashboard.tasks')} ({openTaskCount})
            </span>
          </TabsTrigger>
          <TabsTrigger value="shifts" className="text-xs sm:text-sm py-2.5">
            <Calendar className="h-4 w-4 shrink-0" />
            {t('staffDashboard.shifts')}
          </TabsTrigger>
          <TabsTrigger value="training" className="text-xs sm:text-sm py-2.5">
            <BookOpen className="h-4 w-4 shrink-0" />
            {t('staffDashboard.training')}
          </TabsTrigger>
          <TabsTrigger value="checklists" className="text-xs sm:text-sm py-2.5">
            <ListChecks className="h-4 w-4 shrink-0" />
            {t('staffDashboard.checklist')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-3">
          {!data?.tasks?.length ? (
            <p className="text-sm text-muted-foreground py-4">{t('staffDashboard.noTasks')}</p>
          ) : (
            data.tasks.map((task) => (
              <Card key={task.id}>
                <CardContent className="py-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{task.title}</p>
                    {task.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">{task.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant={task.status === 'completed' ? 'secondary' : 'default'}>
                        {taskStatusLabel(task.status)}
                      </Badge>
                      {task.dueAt && (
                        <span className="text-xs text-muted-foreground">
                          {t('staffDashboard.duePrefix')} {formatDate(task.dueAt, undefined, locale)}
                        </span>
                      )}
                    </div>
                  </div>
                  {task.status !== 'completed' && task.status !== 'cancelled' && (
                    <div className="flex gap-2">
                      {task.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTaskStatus(task.id, 'in_progress')}
                          disabled={!!actioning}
                        >
                          {t('staffDashboard.start')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => handleTaskStatus(task.id, 'completed')}
                        disabled={!!actioning}
                      >
                        {actioning === task.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 mr-1" />
                        )}
                        {t('staffDashboard.complete')}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="shifts" className="space-y-3">
          {!data?.shifts?.length ? (
            <p className="text-sm text-muted-foreground py-4">{t('staffDashboard.noShifts')}</p>
          ) : (
            data.shifts.slice(0, 14).map((shift) => (
              <Card key={shift.id}>
                <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{formatDate(shift.date, undefined, locale)}</span>
                  <span className="text-muted-foreground text-sm">
                    {shift.startTime} – {shift.endTime}
                  </span>
                  {shift.clockInAt && (
                    <Badge variant="outline">
                      {t('staffDashboard.clockInBadge')}{' '}
                      {new Date(shift.clockInAt).toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' })}
                    </Badge>
                  )}
                  {shift.clockOutAt && (
                    <Badge variant="secondary">
                      {t('staffDashboard.clockOutBadge')}{' '}
                      {new Date(shift.clockOutAt).toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' })}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="training" className="space-y-3">
          {!data?.trainingModules?.length ? (
            <p className="text-sm text-muted-foreground py-4">{t('staffDashboard.noTraining')}</p>
          ) : (
            data.trainingModules.map((m) => (
              <Card key={m.id}>
                <CardContent className="py-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{m.title}</p>
                    {m.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">{m.description}</p>
                    )}
                    {m.completed && (
                      <Badge className="mt-2 bg-green-500/20 text-green-700 dark:text-green-400">{t('staffDashboard.completed')}</Badge>
                    )}
                  </div>
                  {!m.completed && (
                    <Button
                      size="sm"
                      onClick={() => handleCompleteTraining(m.id)}
                      disabled={!!actioning}
                    >
                      {actioning === m.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 mr-1" />
                      )}
                      {t('staffDashboard.complete')}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="checklists" className="space-y-3">
          {!data?.checklistTemplates?.length ? (
            <p className="text-sm text-muted-foreground py-4">{t('staffDashboard.noChecklists')}</p>
          ) : (
            data.checklistTemplates.map((c) => (
              <Card key={c.id}>
                <CardContent className="py-4">
                  <p className="font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{checklistTypeLabel(c.type)}</p>
                  <p className="text-sm text-muted-foreground mt-2">{t('staffDashboard.checklistNote')}</p>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {data?.leaveRequests && data.leaveRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('staffDashboard.leaveRequestsTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.leaveRequests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    {formatDate(r.startDate, undefined, locale)} – {formatDate(r.endDate, undefined, locale)}
                    {r.reason && ` · ${r.reason}`}
                  </span>
                  <Badge
                    variant={
                      r.status === 'approved'
                        ? 'default'
                        : r.status === 'rejected'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {leaveStatusLabel(r.status)}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
