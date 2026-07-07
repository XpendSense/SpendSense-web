'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
import { useClient } from '@/hooks/useClient'
import { FullScreenDrawer } from '@/components/ui/FullScreenDrawer'
import { PeoplePanel } from '@/components/budget/PeoplePanel'
import { CategoriesPanel } from '@/components/budget/CategoriesPanel'
import { IncomePanel } from '@/components/budget/IncomePanel'
import { SavingsPanel } from '@/components/budget/SavingsPanel'
import { PaymentMethodsPanel } from '@/components/budget/PaymentMethodsPanel'
import { logger } from '@/lib/logger'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import PeopleIcon from '@mui/icons-material/People'
import CategoryIcon from '@mui/icons-material/Category'
import BarChartIcon from '@mui/icons-material/BarChart'
import SettingsIcon from '@mui/icons-material/Settings'
import LogoutIcon from '@mui/icons-material/Logout'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import MenuIcon from '@mui/icons-material/Menu'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import SavingsIcon from '@mui/icons-material/Savings'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

const SIDEBAR_WIDTH = 240
const SIDEBAR_COLLAPSED_WIDTH = 60
const COLLAPSED_KEY = 'sidebar-collapsed'

interface NavItem {
  label: string
  icon: React.ReactElement
  action: () => void
  disabled?: boolean
  tooltip?: string
}

interface Props {
  budgetId: string
  children: React.ReactNode
}

export function BudgetSidebar({ budgetId, children }: Props) {
  const t = useTranslations('budget.sidebar')
  const router = useRouter()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const client = useClient(BudgetService)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [incomeOpen, setIncomeOpen] = useState(false)
  const [savingsOpen, setSavingsOpen] = useState(false)
  const [paymentMethodsOpen, setPaymentMethodsOpen] = useState(false)
  const [mobileManageOpen, setMobileManageOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === 'true')
  }, [])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      localStorage.setItem(COLLAPSED_KEY, String(!prev))
      return !prev
    })
  }

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

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH

  const sidebarContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Brand + collapse toggle */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          px: collapsed ? 0 : 2,
          py: 1.5,
          minHeight: 64,
        }}
      >
        {!collapsed && (
          <Box sx={{ overflow: 'hidden' }}>
            <Typography variant="overline" color="text.secondary" display="block" noWrap>
              SpendSense
            </Typography>
            <Typography variant="h6" fontWeight={700} noWrap>{budgetName}</Typography>
          </Box>
        )}
        <Tooltip title={collapsed ? t('expand') : t('collapse')} placement="right">
          <IconButton onClick={toggleCollapsed} size="small">
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      <Divider />

      {/* Back to budgets */}
      <List disablePadding>
        <ListItem disablePadding>
          <Tooltip title={collapsed ? t('allBudgets') : ''} placement="right">
            <ListItemButton
              onClick={() => router.push('/budgets')}
              sx={{ justifyContent: collapsed ? 'center' : 'flex-start', px: collapsed ? 0 : 2 }}
            >
              <ListItemIcon sx={{ minWidth: collapsed ? 0 : 40, justifyContent: 'center' }}>
                <ArrowBackIcon />
              </ListItemIcon>
              {!collapsed && <ListItemText primary={t('allBudgets')} />}
            </ListItemButton>
          </Tooltip>
        </ListItem>
      </List>

      <Divider />

      {/* Main nav — budget management + app items */}
      <List disablePadding sx={{ flex: 1 }}>
        {navItems.map((item) => {
          const tooltipTitle = collapsed ? (item.tooltip ?? item.label) : (item.tooltip ?? '')
          return (
            <ListItem key={item.label} disablePadding>
              <Tooltip title={tooltipTitle} placement="right" disableHoverListener={!collapsed && !item.disabled}>
                <span style={{ width: '100%' }}>
                  <ListItemButton
                    onClick={item.action}
                    disabled={item.disabled}
                    sx={{ justifyContent: collapsed ? 'center' : 'flex-start', px: collapsed ? 0 : 2 }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: collapsed ? 0 : 40,
                        justifyContent: 'center',
                        color: item.disabled ? 'text.disabled' : 'inherit',
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    {!collapsed && (
                      <ListItemText
                        primary={item.label}
                        primaryTypographyProps={{ color: item.disabled ? 'text.disabled' : 'inherit' }}
                      />
                    )}
                  </ListItemButton>
                </span>
              </Tooltip>
            </ListItem>
          )
        })}
      </List>

      <Divider />

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          px: collapsed ? 0 : 2,
          minHeight: 48,
        }}
      >
        {!collapsed && <Typography variant="body2" color="text.secondary">{t('theme')}</Typography>}
        <ThemeToggle />
      </Box>

      <Divider />

      {/* Logout */}
      <List disablePadding>
        <ListItem disablePadding>
          <Tooltip title={collapsed ? t('logout') : ''} placement="right">
            <ListItemButton
              onClick={handleLogout}
              sx={{ justifyContent: collapsed ? 'center' : 'flex-start', px: collapsed ? 0 : 2 }}
            >
              <ListItemIcon sx={{ minWidth: collapsed ? 0 : 40, justifyContent: 'center' }}>
                <LogoutIcon />
              </ListItemIcon>
              {!collapsed && <ListItemText primary={t('logout')} />}
            </ListItemButton>
          </Tooltip>
        </ListItem>
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Desktop permanent sidebar */}
      {!isMobile && (
        <Drawer
          variant="permanent"
          sx={{
            width: sidebarWidth,
            flexShrink: 0,
            transition: theme.transitions.create('width', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
            '& .MuiDrawer-paper': {
              width: sidebarWidth,
              boxSizing: 'border-box',
              overflowX: 'hidden',
              transition: theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen,
              }),
            },
          }}
        >
          {sidebarContent}
        </Drawer>
      )}

      {/* Main content */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Mobile top bar */}
        {isMobile && (
          <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Toolbar>
              <IconButton edge="start" onClick={() => router.push('/budgets')} sx={{ mr: 1 }} aria-label="back">
                <ArrowBackIcon />
              </IconButton>
              <Typography variant="h6" fontWeight={700} noWrap sx={{ flex: 1 }}>{budgetName}</Typography>
              <ThemeToggle />
              <IconButton onClick={() => setMobileManageOpen(true)} aria-label={t('manage')} sx={{ ml: 0.5 }}>
                <MenuIcon />
              </IconButton>
            </Toolbar>
          </AppBar>
        )}

        <Box sx={{ flex: 1, pb: isMobile ? 7 : 0 }}>
          {children}
        </Box>
      </Box>

      {/* Mobile management drawer */}
      <Drawer
        anchor="right"
        open={mobileManageOpen}
        onClose={() => setMobileManageOpen(false)}
        sx={{ display: { md: 'none' } }}
      >
        <Box sx={{ width: 260, pt: 1 }}>
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="overline" color="text.secondary" display="block">SpendSense</Typography>
            <Typography variant="h6" fontWeight={700} noWrap>{budgetName}</Typography>
          </Box>
          <Divider />
          <List>
            {managementItems.map((item) => (
              <ListItem key={item.label} disablePadding>
                <ListItemButton onClick={() => openMobilePanel(item.action)}>
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
          <Divider />
          <List>
            {appItems.map((item) => (
              <ListItem key={item.label} disablePadding>
                <Tooltip title={item.tooltip ?? ''} disableHoverListener={!item.disabled}>
                  <span style={{ width: '100%' }}>
                    <ListItemButton
                      onClick={() => { setMobileManageOpen(false); item.action() }}
                      disabled={item.disabled}
                    >
                      <ListItemIcon sx={{ color: item.disabled ? 'text.disabled' : 'inherit' }}>
                        {item.icon}
                      </ListItemIcon>
                      <ListItemText
                        primary={item.label}
                        primaryTypographyProps={{ color: item.disabled ? 'text.disabled' : 'inherit' }}
                      />
                    </ListItemButton>
                  </span>
                </Tooltip>
              </ListItem>
            ))}
          </List>
          <Divider />
          <List>
            <ListItem disablePadding>
              <ListItemButton onClick={() => { setMobileManageOpen(false); handleLogout() }}>
                <ListItemIcon><LogoutIcon /></ListItemIcon>
                <ListItemText primary={t('logout')} />
              </ListItemButton>
            </ListItem>
          </List>
        </Box>
      </Drawer>

      {/* Management panels */}
      <FullScreenDrawer open={categoriesOpen} onClose={() => setCategoriesOpen(false)} title={t('categories')}>
        <CategoriesPanel />
      </FullScreenDrawer>

      <FullScreenDrawer open={peopleOpen} onClose={() => setPeopleOpen(false)} title={t('people')}>
        <PeoplePanel budgetProfileId={budgetId} />
      </FullScreenDrawer>

      <FullScreenDrawer open={incomeOpen} onClose={() => setIncomeOpen(false)} title={t('income')}>
        <IncomePanel budgetProfileId={budgetId} showBeforeTax={showBeforeTax} />
      </FullScreenDrawer>

      <FullScreenDrawer open={savingsOpen} onClose={() => setSavingsOpen(false)} title={t('savings')}>
        <SavingsPanel budgetProfileId={budgetId} activePeriodStart={activePeriodStart} />
      </FullScreenDrawer>

      <FullScreenDrawer open={paymentMethodsOpen} onClose={() => setPaymentMethodsOpen(false)} title={t('paymentMethods')}>
        <PaymentMethodsPanel budgetProfileId={budgetId} budgetPeriodId={activePeriod?.id} />
      </FullScreenDrawer>
    </Box>
  )
}
