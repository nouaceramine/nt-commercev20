import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { X, Delete, Calculator as CalcIcon } from 'lucide-react';

export const Calculator = ({ isOpen, onClose }) => {
  const { language } = useLanguage();
  const [display, setDisplay] = useState('0');
  const [previousValue, setPreviousValue] = useState(null);
  const [operation, setOperation] = useState(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);

  const inputDigit = (digit) => {
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === '0' ? digit : display + digit);
    }
  };

  const inputDecimal = () => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const clear = () => {
    setDisplay('0');
    setPreviousValue(null);
    setOperation(null);
    setWaitingForOperand(false);
  };

  const clearEntry = () => {
    setDisplay('0');
  };

  const backspace = () => {
    if (display.length === 1 || (display.length === 2 && display[0] === '-')) {
      setDisplay('0');
    } else {
      setDisplay(display.slice(0, -1));
    }
  };

  const toggleSign = () => {
    const value = parseFloat(display);
    setDisplay(String(value * -1));
  };

  const inputPercent = () => {
    const value = parseFloat(display);
    setDisplay(String(value / 100));
  };

  const performOperation = (nextOperation) => {
    const inputValue = parseFloat(display);

    if (previousValue === null) {
      setPreviousValue(inputValue);
    } else if (operation) {
      const currentValue = previousValue || 0;
      let result;

      switch (operation) {
        case '+':
          result = currentValue + inputValue;
          break;
        case '-':
          result = currentValue - inputValue;
          break;
        case '*':
          result = currentValue * inputValue;
          break;
        case '/':
          result = inputValue !== 0 ? currentValue / inputValue : 'Error';
          break;
        default:
          result = inputValue;
      }

      setDisplay(String(result));
      setPreviousValue(result);
    }

    setWaitingForOperand(true);
    setOperation(nextOperation);
  };

  const calculate = () => {
    if (!operation || previousValue === null) return;

    const inputValue = parseFloat(display);
    let result;

    switch (operation) {
      case '+':
        result = previousValue + inputValue;
        break;
      case '-':
        result = previousValue - inputValue;
        break;
      case '*':
        result = previousValue * inputValue;
        break;
      case '/':
        result = inputValue !== 0 ? previousValue / inputValue : 'Error';
        break;
      default:
        result = inputValue;
    }

    setDisplay(String(result));
    setPreviousValue(null);
    setOperation(null);
    setWaitingForOperand(true);
  };

  if (!isOpen) return null;

  const CalcButton = ({ onClick, children, className = '', variant = 'default' }) => {
    const baseClass = 'h-14 rounded-xl font-semibold text-lg transition-all active:scale-95 flex items-center justify-center';
    const variants = {
      default: 'bg-muted hover:bg-muted/80 text-foreground',
      number: 'bg-card hover:bg-card/80 text-foreground border shadow-sm',
      operation: 'bg-primary hover:bg-primary/90 text-primary-foreground',
      function: 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
    };
    
    return (
      <button
        onClick={onClick}
        className={`${baseClass} ${variants[variant]} ${className}`}
      >
        {children}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div 
        className="bg-background rounded-2xl shadow-2xl w-80 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        data-testid="calculator-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
          <div className="flex items-center gap-2">
            <CalcIcon className="h-5 w-5" />
            <span className="font-semibold">
              {language === 'ar' ? 'الآلة الحاسبة' : 'Calculatrice'}
            </span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded-lg transition-colors"
            data-testid="calculator-close-btn"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Display */}
        <div className="p-4 bg-card/50">
          <div className="text-right">
            {previousValue !== null && operation && (
              <div className="text-sm text-muted-foreground mb-1">
                {previousValue} {operation}
              </div>
            )}
            <div 
              className="text-4xl font-bold truncate"
              data-testid="calculator-display"
            >
              {display}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="p-3 grid grid-cols-4 gap-2">
          {/* Row 1 */}
          <CalcButton variant="function" onClick={clear}>C</CalcButton>
          <CalcButton variant="function" onClick={clearEntry}>CE</CalcButton>
          <CalcButton variant="function" onClick={backspace}>
            <Delete className="h-5 w-5" />
          </CalcButton>
          <CalcButton variant="operation" onClick={() => performOperation('/')}>÷</CalcButton>

          {/* Row 2 */}
          <CalcButton variant="number" onClick={() => inputDigit('7')}>7</CalcButton>
          <CalcButton variant="number" onClick={() => inputDigit('8')}>8</CalcButton>
          <CalcButton variant="number" onClick={() => inputDigit('9')}>9</CalcButton>
          <CalcButton variant="operation" onClick={() => performOperation('*')}>×</CalcButton>

          {/* Row 3 */}
          <CalcButton variant="number" onClick={() => inputDigit('4')}>4</CalcButton>
          <CalcButton variant="number" onClick={() => inputDigit('5')}>5</CalcButton>
          <CalcButton variant="number" onClick={() => inputDigit('6')}>6</CalcButton>
          <CalcButton variant="operation" onClick={() => performOperation('-')}>−</CalcButton>

          {/* Row 4 */}
          <CalcButton variant="number" onClick={() => inputDigit('1')}>1</CalcButton>
          <CalcButton variant="number" onClick={() => inputDigit('2')}>2</CalcButton>
          <CalcButton variant="number" onClick={() => inputDigit('3')}>3</CalcButton>
          <CalcButton variant="operation" onClick={() => performOperation('+')}>+</CalcButton>

          {/* Row 5 */}
          <CalcButton variant="number" onClick={toggleSign}>±</CalcButton>
          <CalcButton variant="number" onClick={() => inputDigit('0')}>0</CalcButton>
          <CalcButton variant="number" onClick={inputDecimal}>.</CalcButton>
          <CalcButton variant="operation" onClick={calculate}>=</CalcButton>

          {/* Row 6 - Extra functions */}
          <CalcButton variant="function" onClick={inputPercent} className="col-span-2">%</CalcButton>
          <CalcButton variant="function" onClick={() => {
            const value = parseFloat(display);
            if (value > 0) setDisplay(String(Math.sqrt(value)));
          }} className="col-span-2">√</CalcButton>
        </div>
      </div>
    </div>
  );
};

export default Calculator;
