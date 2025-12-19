declare module 'react-resizable-panels' {
  import { FC, ReactNode, CSSProperties } from 'react';

  export interface PanelGroupProps {
    autoSaveId?: string;
    children?: ReactNode;
    className?: string;
    direction?: 'horizontal' | 'vertical';
    id?: string;
    style?: CSSProperties;
    onLayout?: (sizes: number[]) => void;
  }

  export interface PanelProps {
    children?: ReactNode;
    className?: string;
    collapsedSize?: number;
    collapsible?: boolean;
    defaultSize?: number;
    id?: string;
    maxSize?: number;
    minSize?: number;
    order?: number;
    style?: CSSProperties;
    onCollapse?: (collapsed: boolean) => void;
    onResize?: (size: number) => void;
  }

  export interface PanelResizeHandleProps {
    children?: ReactNode;
    className?: string;
    disabled?: boolean;
    id?: string;
    style?: CSSProperties;
    onDragging?: (isDragging: boolean) => void;
  }

  export const PanelGroup: FC<PanelGroupProps>;
  export const Panel: FC<PanelProps>;
  export const PanelResizeHandle: FC<PanelResizeHandleProps>;
}
