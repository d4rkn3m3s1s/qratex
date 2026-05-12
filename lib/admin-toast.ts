import { toast as sonnerToast } from 'sonner';

type ToastArgs = Parameters<typeof sonnerToast>;
type ToastMessage = ToastArgs[0];
type ToastOptions = ToastArgs[1];

const formatWithPrefix = (prefix: string, message: ToastMessage) => {
  if (typeof message === 'string') return `${prefix}${message}`;
  return message;
};

export const toast = Object.assign(
  ((message: ToastMessage, options?: ToastOptions) => sonnerToast(formatWithPrefix('Bilgi: ', message), options)) as typeof sonnerToast,
  sonnerToast,
  {
    success: (message: ToastMessage, options?: ToastOptions) =>
      sonnerToast.success(formatWithPrefix('Basarili: ', message), options),
    error: (message: ToastMessage, options?: ToastOptions) =>
      sonnerToast.error(formatWithPrefix('Dikkat: ', message), options),
  }
);
