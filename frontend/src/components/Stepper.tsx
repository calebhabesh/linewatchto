"use client";

import React, {
  Children,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import "./Stepper.css";

export interface StepperProps {
  children: ReactNode;
  initialStep?: number;
  currentStep?: number;
  onStepChange?: (step: number) => void;
  onFinalStepCompleted?: () => void;
  stepCircleContainerClassName?: string;
  stepContainerClassName?: string;
  contentClassName?: string;
  contentId?: string;
  footerClassName?: string;
  backButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  nextButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  backButtonText?: string;
  nextButtonText?: string;
  completeButtonText?: string;
  disableStepIndicators?: boolean;
  indicatorsBelowContent?: boolean;
  renderStepIndicator?: (props: {
    step: number;
    currentStep: number;
    totalSteps: number;
    onStepClick: (step: number) => void;
  }) => ReactNode;
  renderFooter?: (props: {
    currentStep: number;
    totalSteps: number;
    isLastStep: boolean;
    handleBack: () => void;
    handleNext: () => void;
    handleComplete: () => void;
  }) => ReactNode;
  className?: string;
  contentProps?: React.HTMLAttributes<HTMLDivElement>;
  [key: string]: unknown;
}

export default function Stepper({
  children,
  initialStep = 1,
  currentStep: controlledStep,
  onStepChange = () => {},
  onFinalStepCompleted = () => {},
  stepCircleContainerClassName = "",
  stepContainerClassName = "",
  contentClassName = "",
  contentId,
  footerClassName = "",
  backButtonProps = {},
  nextButtonProps = {},
  backButtonText = "Back",
  nextButtonText = "Continue",
  completeButtonText = "Complete",
  disableStepIndicators = false,
  indicatorsBelowContent = false,
  renderStepIndicator,
  renderFooter,
  className = "",
  contentProps = {},
  ...rest
}: StepperProps) {
  const isControlled = controlledStep !== undefined;
  const [internalStep, setInternalStep] = useState<number>(initialStep);
  const currentStep = isControlled ? controlledStep : internalStep;
  const [direction, setDirection] = useState<number>(0);
  const [prevStep, setPrevStep] = useState<number>(currentStep);

  if (currentStep !== prevStep) {
    setPrevStep(currentStep);
    setDirection(currentStep > prevStep ? 1 : -1);
  }

  const stepsArray = Children.toArray(children);
  const totalSteps = stepsArray.length;
  const isCompleted = currentStep > totalSteps;
  const isLastStep = currentStep === totalSteps;

  const updateStep = (newStep: number) => {
    if (!isControlled) {
      setInternalStep(newStep);
    }
    if (newStep > totalSteps) {
      onFinalStepCompleted();
    } else {
      onStepChange(newStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setDirection(-1);
      updateStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (!isLastStep) {
      setDirection(1);
      updateStep(currentStep + 1);
    }
  };

  const handleComplete = () => {
    setDirection(1);
    updateStep(totalSteps + 1);
  };

  const indicators = (
    <div
      className={`step-indicator-row ${stepContainerClassName}`.trim()}
      role="group"
      aria-label="Choose an introduction slide"
    >
      {stepsArray.map((_, index) => {
        const stepNumber = index + 1;
        const isNotLastStep = index < totalSteps - 1;
        return (
          <React.Fragment key={stepNumber}>
            {renderStepIndicator ? (
              renderStepIndicator({
                step: stepNumber,
                currentStep,
                totalSteps,
                onStepClick: (clicked) => {
                  setDirection(clicked > currentStep ? 1 : -1);
                  updateStep(clicked);
                },
              })
            ) : (
              <StepIndicator
                step={stepNumber}
                totalSteps={totalSteps}
                disableStepIndicators={disableStepIndicators}
                currentStep={currentStep}
                onClickStep={(clicked) => {
                  setDirection(clicked > currentStep ? 1 : -1);
                  updateStep(clicked);
                }}
              />
            )}
            {isNotLastStep && <StepConnector isComplete={currentStep > stepNumber} />}
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <div className={`stepper-outer-container ${className}`.trim()} {...rest}>
      <div className={`stepper-circle-container ${stepCircleContainerClassName}`.trim()}>
        {!indicatorsBelowContent && indicators}

        <StepContentWrapper
          isCompleted={isCompleted}
          currentStep={currentStep}
          direction={direction}
          className={contentClassName}
          contentId={contentId}
          contentProps={contentProps}
        >
          {stepsArray[Math.max(0, Math.min(totalSteps - 1, currentStep - 1))]}
        </StepContentWrapper>

        {indicatorsBelowContent && indicators}

        {!isCompleted &&
          (renderFooter ? (
            renderFooter({
              currentStep,
              totalSteps,
              isLastStep,
              handleBack,
              handleNext,
              handleComplete,
            })
          ) : (
            <div className={`footer-container ${footerClassName}`.trim()}>
              <div className={`footer-nav ${currentStep !== 1 ? "spread" : "end"}`}>
                {currentStep !== 1 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className={`back-button ${currentStep === 1 ? "inactive" : ""}`}
                    {...backButtonProps}
                  >
                    {backButtonText}
                  </button>
                )}
                <button
                  type="button"
                  onClick={isLastStep ? handleComplete : handleNext}
                  className="next-button"
                  {...nextButtonProps}
                >
                  {isLastStep ? completeButtonText : nextButtonText}
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

interface StepContentWrapperProps {
  isCompleted: boolean;
  currentStep: number;
  direction: number;
  children: ReactNode;
  className?: string;
  contentId?: string;
  contentProps?: React.HTMLAttributes<HTMLDivElement>;
}

function StepContentWrapper({
  isCompleted,
  currentStep,
  direction,
  children,
  className,
  contentId,
  contentProps,
}: StepContentWrapperProps) {
  return (
    <div
      id={contentId}
      className={`step-content-default ${className || ""}`.trim()}
      style={{ position: "relative", overflow: "hidden" }}
      {...contentProps}
    >
      <AnimatePresence initial={false} mode="wait" custom={direction}>
        {!isCompleted && (
          <SlideTransition key={currentStep} direction={direction}>
            {children}
          </SlideTransition>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SlideTransitionProps {
  children: ReactNode;
  direction: number;
}

function SlideTransition({ children, direction }: SlideTransitionProps) {
  return (
    <motion.div
      custom={direction}
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
      style={{ width: "100%" }}
    >
      {children}
    </motion.div>
  );
}

const stepVariants: Variants = {
  enter: (dir: number) => ({
    x: dir >= 0 ? 32 : -32,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: dir >= 0 ? -32 : 32,
    opacity: 0,
  }),
};

export interface StepProps {
  children: ReactNode;
  className?: string;
}

export function Step({ children, className = "" }: StepProps): React.ReactElement {
  return <div className={`step-default ${className}`.trim()}>{children}</div>;
}

interface StepIndicatorProps {
  step: number;
  totalSteps: number;
  currentStep: number;
  onClickStep: (step: number) => void;
  disableStepIndicators?: boolean;
}

function StepIndicator({
  step,
  totalSteps,
  currentStep,
  onClickStep,
  disableStepIndicators,
}: StepIndicatorProps) {
  const status = currentStep === step ? "active" : currentStep < step ? "inactive" : "complete";

  const handleClick = () => {
    if (step !== currentStep && !disableStepIndicators) {
      onClickStep(step);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`step-indicator step-indicator--${status}`}
      style={disableStepIndicators ? { pointerEvents: "none", opacity: 0.5 } : {}}
      aria-label={`Go to slide ${step} of ${totalSteps}`}
      aria-current={status === "active" ? "step" : undefined}
    >
      <motion.div
        variants={{
          inactive: { scale: 1 },
          active: { scale: 1.08 },
          complete: { scale: 1 },
        }}
        transition={{ duration: 0.22 }}
        className={`step-indicator-inner step-indicator-inner--${status}`}
      >
        {status === "complete" ? (
          <CheckIcon className="check-icon" />
        ) : status === "active" ? (
          <div className="active-dot" />
        ) : (
          <span className="step-number">{step}</span>
        )}
      </motion.div>
    </button>
  );
}

interface StepConnectorProps {
  isComplete: boolean;
}

function StepConnector({ isComplete }: StepConnectorProps) {
  return (
    <div className="step-connector" aria-hidden="true">
      <motion.div
        className="step-connector-inner"
        initial={false}
        animate={{
          width: isComplete ? "100%" : "0%",
        }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <motion.path
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.06, type: "tween", ease: "easeOut", duration: 0.24 }}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}
