'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useQuery } from '@tanstack/react-query'
import { useThemeMode } from '@/context/ThemeContext'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import { BudgetRole } from '@/gen/wellspent/v1/common_pb'
import { useClient } from '@/hooks/useClient'
import { useBudgetRole } from '@/hooks/useBudgetRole'
import { DesktopSidebar } from './sidebar/DesktopSidebar'
import { MobileTopBar } from './sidebar/MobileTopBar'
import { MobileManageDrawer } from './sidebar/MobileManageDrawer'
import { ManagementDrawers } from './sidebar/ManagementDrawers'
import type { NavItem } from './sidebar/types'
import { EmailVerificationBanner } from '@/components/auth/EmailVerificationBanner'
import { logger } from '@/lib/logger'
import Box from '@mui/material/Box'
import PeopleIcon from '@mui/icons-material/People'
import MailIcon from '@mui/icons-material/Mail'
import CategoryIcon from '@mui/icons-material/Category'
import BarChartIcon from '@mui/icons-material/BarChart'
import SettingsIcon from '@mui/icons-material/Settings'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import SavingsIcon from '@mui/icons-material/Savings'
import CreditCardIcon from '@mui/icons-material/CreditCard'

const COLLAPSED_KEY = 'sidebar-collapsed'

interface Props {
  budgetId: string
  children: React.ReactNode
}

export function BudgetSidebar({ budgetId, children }: Props) {
  const t = useTranslations('budget.sidebar')
  const router = useRouter()
  const theme = useTheme()
  // Sidebar collapses to a bottom bar earlier than the `sm` app-wide
  // breakpoint — there's a permanent sidebar to make room for down to `md`.
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const client = useClient(BudgetService)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [invitesOpen, setInvitesOpen] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [incomeOpen, setIncomeOpen] = useState(false)
  const [savingsOpen, setSavingsOpen] = useState(false)
  const [paymentMethodsOpen, setPaymentMethodsOpen] = useState(false)
  const [mobileManageOpen, setMobileManageOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [themeMounted, setThemeMounted] = useState(false)
  const { effective } = useThemeMode()

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === 'true')
    setThemeMounted(true)
  }, [])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      localStorage.setItem(COLLAPSED_KEY, String(!prev))
      return !prev
    })
  }

  const myRole = useBudgetRole(budgetId)
  const canEdit = myRole === BudgetRole.ADMIN || myRole === BudgetRole.COLLABORATOR
  const canManageUsers = myRole === BudgetRole.ADMIN

  const { data } = useQuery({
    queryKey: ['budget-profile', budgetId],
    queryFn: () => client.getBudgetProfile({ id: budgetId }),
  })

  const { data: periodsData } = useQuery({
    queryKey: ['budget-periods', budgetId],
    queryFn: () => client.listBudgetPeriods({ budgetProfileId: budgetId }),
    enabled: !!data,
  })

  const budgetName = data?.profile?.name ?? '…'
  const showBeforeTax = (data?.profile?.countryCode ?? '') === 'US'
  const iconSrc = themeMounted && effective === 'dark' ? '/app-icon-dark.png' : '/app-icon-light.png'

  const periods = periodsData?.periods ?? []
  const activePeriod = [...periods]
    .filter((p) => !p.isArchived)
    .sort((a, b) => Number(b.startDate?.seconds ?? 0n) - Number(a.startDate?.seconds ?? 0n))[0]
    ?? periods[0]
  const activePeriodStart = activePeriod?.startDate
    ? new Date(Number(activePeriod.startDate.seconds) * 1000)
    : undefined

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      logger.info('auth.logout')
    } finally {
      router.push('/login')
    }
  }

  function goToBudgets() {
    router.push('/budgets')
  }

  function openMobilePanel(openFn: () => void) {
    setMobileManageOpen(false)
    openFn()
  }

  const managementItems: NavItem[] = [
    { label: t('income'), icon: <AttachMoneyIcon />, action: () => setIncomeOpen(true) },
    { label: t('savings'), icon: <SavingsIcon />, action: () => setSavingsOpen(true) },
    { label: t('paymentMethods'), icon: <CreditCardIcon />, action: () => setPaymentMethodsOpen(true) },
    { label: t('categories'), icon: <CategoryIcon />, action: () => setCategoriesOpen(true) },
    { label: t('people'), icon: <PeopleIcon />, action: () => setPeopleOpen(true) },
    ...(canManageUsers ? [{ label: t('invitations'), icon: <MailIcon />, action: () => setInvitesOpen(true) }] : []),
  ]

  const appItems: NavItem[] = [
    {
      label: t('reports'),
      icon: <BarChartIcon />,
      action: () => {},
      disabled: true,
      tooltip: t('reportsSoon'),
    },
    {
      label: t('settings'),
      icon: <SettingsIcon />,
      action: () => router.push({ pathname: '/settings', query: { from: budgetId } }),
      disabled: false,
    },
  ]

  const navItems = [...managementItems, ...appItems]

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      {!isMobile && (
        <DesktopSidebar
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          budgetName={budgetName}
          iconSrc={iconSrc}
          navItems={navItems}
          onBackToBudgets={goToBudgets}
          onLogout={handleLogout}
        />
      )}

      {/* Main content */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <EmailVerificationBanner />
        {isMobile && (
          <MobileTopBar iconSrc={iconSrc} onBackToBudgets={goToBudgets} onOpenManage={() => setMobileManageOpen(true)} />
        )}

        <Box sx={{ flex: 1 }}>
          {children}
        </Box>
      </Box>

      <MobileManageDrawer
        open={mobileManageOpen}
        onClose={() => setMobileManageOpen(false)}
        budgetName={budgetName}
        iconSrc={iconSrc}
        managementItems={managementItems}
        appItems={appItems}
        onOpenPanel={openMobilePanel}
        onLogout={handleLogout}
      />

      <ManagementDrawers
        open={{
          categories: categoriesOpen,
          people: peopleOpen,
          invites: invitesOpen,
          income: incomeOpen,
          savings: savingsOpen,
          paymentMethods: paymentMethodsOpen,
        }}
        onClose={{
          categories: () => setCategoriesOpen(false),
          people: () => setPeopleOpen(false),
          invites: () => setInvitesOpen(false),
          income: () => setIncomeOpen(false),
          savings: () => setSavingsOpen(false),
          paymentMethods: () => setPaymentMethodsOpen(false),
        }}
        budgetId={budgetId}
        canEdit={canEdit}
        canManageUsers={canManageUsers}
        showBeforeTax={showBeforeTax}
        activePeriodStart={activePeriodStart}
        activePeriodId={activePeriod?.id}
      />
    </Box>
  )
}
