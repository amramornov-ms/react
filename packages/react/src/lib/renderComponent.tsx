import cx from 'classnames'
import * as React from 'react'
import * as _ from 'lodash'

import callable from './callable'
import felaRenderer from './felaRenderer'
import getClasses from './getClasses'
import getElementType from './getElementType'
import getUnhandledProps from './getUnhandledProps'
import logProviderMissingWarning from './providerMissingHandler'
import {
  ComponentStyleFunctionParam,
  ComponentVariablesObject,
  ComponentSlotClasses,
  ComponentSlotStylesPrepared,
  PropsWithVarsAndStyles,
  State,
  ThemePrepared,
} from '../themes/types'
import { Props, ProviderContextPrepared } from '../types'
import { AccessibilityDefinition, FocusZoneMode } from './accessibility/types'
import { ReactAccessibilityBehavior, AccessibilityActionHandlers } from './accessibility/reactTypes'
import { defaultBehavior } from './accessibility'
import getKeyDownHandlers from './getKeyDownHandlers'
import { mergeComponentStyles, mergeComponentVariables } from './mergeThemes'
import { FocusZone, FocusZone as FabricFocusZone } from './accessibility/FocusZone'
import { FOCUSZONE_WRAP_ATTRIBUTE } from './accessibility/FocusZone/focusUtilities'
import createAnimationStyles from './createAnimationStyles'

export interface RenderResultConfig<P> {
  ElementType: React.ElementType<P>
  classes: ComponentSlotClasses
  unhandledProps: Props
  variables: ComponentVariablesObject
  styles: ComponentSlotStylesPrepared
  accessibility: ReactAccessibilityBehavior
  rtl: boolean
  theme: ThemePrepared
  wrap: RenderComponentCallback<P>
}

// TODO: can we rename?
export type RenderComponentCallback<P> = (
  children: React.ReactNode | React.ReactNodeArray,
) => React.ReactElement<P>

export interface RenderConfig<P> {
  className?: string
  displayName: string
  handledProps: string[]
  props: PropsWithVarsAndStyles
  state: State
  actionHandlers: AccessibilityActionHandlers
  focusZoneRef?: React.Ref<FocusZone>
  context: ProviderContextPrepared
}

const getAccessibility = (
  props: State & PropsWithVarsAndStyles,
  actionHandlers: AccessibilityActionHandlers,
  isRtlEnabled: boolean,
) => {
  const { accessibility: customAccessibility, defaultAccessibility } = props
  const accessibility: AccessibilityDefinition = (customAccessibility ||
    defaultAccessibility ||
    defaultBehavior)(props)

  const keyHandlers = getKeyDownHandlers(actionHandlers, accessibility.keyActions, isRtlEnabled)
  return {
    ...accessibility,
    keyHandlers,
  }
}

const renderComponent = <P extends {}>(config: RenderConfig<P>): RenderResultConfig<P> => {
  const {
    className,
    displayName,
    handledProps,
    props,
    state,
    actionHandlers,
    focusZoneRef,
    context,
  } = config

  if (_.isEmpty(context)) {
    logProviderMissingWarning()
  }

  const { rtl = false, renderer = felaRenderer, disableAnimations = false } = context || {}

  const {
    siteVariables = {
      fontSizes: {},
    },
    componentVariables = {},
    componentStyles = {},
  } = (context.theme as ThemePrepared) || {}

  const ElementType = getElementType(props) as React.ReactType<P>

  const stateAndProps = { ...state, ...props }

  // Resolve variables for this component, allow props.variables to override
  const resolvedVariables: ComponentVariablesObject = mergeComponentVariables(
    componentVariables[displayName],
    props.variables,
  )(siteVariables)

  const animationCSSProp = props.animation
    ? createAnimationStyles(props.animation, context.theme)
    : {}

  // Resolve styles using resolved variables, merge results, allow props.styles to override
  const mergedStyles: ComponentSlotStylesPrepared = mergeComponentStyles(
    componentStyles[displayName],
    {
      root: props.styles,
    },
  )

  const accessibility: ReactAccessibilityBehavior = getAccessibility(
    stateAndProps,
    actionHandlers,
    rtl,
  )

  const unhandledProps = getUnhandledProps({ handledProps }, props)

  const styleParam: ComponentStyleFunctionParam = {
    props: stateAndProps,
    variables: resolvedVariables,
    theme: context.theme,
    rtl,
    disableAnimations,
  }

  mergedStyles.root = {
    ...callable(mergedStyles.root)(styleParam),
    ...animationCSSProp,
  }

  const resolvedStyles: ComponentSlotStylesPrepared = Object.keys(mergedStyles).reduce(
    (acc, next) => ({ ...acc, [next]: callable(mergedStyles[next])(styleParam) }),
    {},
  )

  const classes: ComponentSlotClasses = getClasses(renderer, mergedStyles, styleParam)
  classes.root = cx(className, classes.root, props.className)

  const resolvedConfig: RenderResultConfig<P> = {
    ElementType,
    unhandledProps,
    classes,
    variables: resolvedVariables,
    styles: resolvedStyles,
    accessibility,
    rtl,
    theme: context.theme,
    wrap: (element: React.ReactElement<P>) => element,
  }

  if (accessibility.focusZone && accessibility.focusZone.mode === FocusZoneMode.Wrap) {
    resolvedConfig.wrap = children => (
      <FabricFocusZone
        ref={focusZoneRef}
        isRtl={resolvedConfig.rtl}
        {...accessibility.focusZone.props}
        {...{ [FOCUSZONE_WRAP_ATTRIBUTE]: true }}
      >
        {children}
      </FabricFocusZone>
    )
  }

  if (accessibility.focusZone && accessibility.focusZone.mode === FocusZoneMode.Embed) {
    const originalElementType = resolvedConfig.ElementType
    resolvedConfig.ElementType = FabricFocusZone as any
    resolvedConfig.unhandledProps = {
      ...resolvedConfig.unhandledProps,
      ...accessibility.focusZone.props,
    }
    resolvedConfig.unhandledProps.as = originalElementType
    resolvedConfig.unhandledProps.ref = focusZoneRef
    resolvedConfig.unhandledProps.isRtl = resolvedConfig.rtl
  }

  return resolvedConfig
}

export default renderComponent
