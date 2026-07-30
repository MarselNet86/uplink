import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from './Input';

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(
  (props, ref) => {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <Input ref={ref} type={visible ? 'text' : 'password'} className="pr-7" {...props} />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          className="absolute bottom-1.5 right-0 text-muted hover:text-ink"
          aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';
