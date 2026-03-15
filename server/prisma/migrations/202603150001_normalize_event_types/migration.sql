-- Normalize historical event names to canonical UPPER_SNAKE_CASE values
UPDATE "event_log"
SET "eventType" = CASE "eventType"
    WHEN 'OrderPlaced' THEN 'ORDER_PLACED'
    WHEN 'PaymentReceived' THEN 'PAYMENT_RECEIVED'
    WHEN 'OrderConfirmed' THEN 'ORDER_CONFIRMED'
    WHEN 'OrderCooking' THEN 'ORDER_COOKING'
    WHEN 'OrderBaking' THEN 'ORDER_BAKING'
    WHEN 'OrderReady' THEN 'ORDER_READY'
    WHEN 'OrderDelivery' THEN 'ORDER_DELIVERY'
    WHEN 'OrderCompleted' THEN 'ORDER_COMPLETED'
    WHEN 'OrderCancelled' THEN 'ORDER_CANCELLED'
    WHEN 'PosSyncStarted' THEN 'POS_SYNC_STARTED'
    WHEN 'PosSyncSuccess' THEN 'POS_SYNC_SUCCESS'
    WHEN 'PosSyncFailed' THEN 'POS_SYNC_FAILED'
    WHEN 'PosValidated' THEN 'POS_VALIDATED'
    WHEN 'PaymentFailed' THEN 'PAYMENT_FAILED'
    WHEN 'StockOut' THEN 'STOCK_OUT'
    WHEN 'StockBack' THEN 'STOCK_BACK'
    WHEN 'ProductUpdated' THEN 'PRODUCT_UPDATED'
    WHEN 'ProductStopped' THEN 'PRODUCT_STOPPED'
    ELSE "eventType"
END
WHERE "eventType" IN (
    'OrderPlaced',
    'PaymentReceived',
    'OrderConfirmed',
    'OrderCooking',
    'OrderBaking',
    'OrderReady',
    'OrderDelivery',
    'OrderCompleted',
    'OrderCancelled',
    'PosSyncStarted',
    'PosSyncSuccess',
    'PosSyncFailed',
    'PosValidated',
    'PaymentFailed',
    'StockOut',
    'StockBack',
    'ProductUpdated',
    'ProductStopped'
);
