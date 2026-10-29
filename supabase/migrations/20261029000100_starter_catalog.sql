-- Starter catalog: approved categories and common items in Arabic and English,
-- so a new household can tap instead of type from the first day.

create temporary table seed_categories (
  key text primary key,
  parent_key text,
  icon text,
  name_en text,
  name_ar text,
  expiry_type text,
  shelf_life_days int,
  location text,
  sort_order int
);

insert into seed_categories values
  ('food',       null,      '🍽️', 'Food',                 'طعام',               'printed',   null, 'pantry',   10),
  ('grains',     'food',    '🌾', 'Rice, grains and pasta','أرز وحبوب ومعكرونة',   null,        null, 'pantry',   11),
  ('dairy',      'food',    '🥛', 'Dairy and eggs',       'ألبان وبيض',          'printed',   null, 'fridge',   12),
  ('fruit',      'food',    '🍎', 'Fruit',                'فواكه',              'estimated', 7,    'fridge',   13),
  ('vegetables', 'food',    '🥕', 'Vegetables',           'خضار',               'estimated', 7,    'fridge',   14),
  ('meat',       'food',    '🍗', 'Meat and fish',        'لحوم وأسماك',         'printed',   null, 'freezer',  15),
  ('bakery',     'food',    '🍞', 'Bread and bakery',     'خبز ومخبوزات',        'estimated', 3,    'pantry',   16),
  ('canned',     'food',    '🥫', 'Canned and jars',      'معلبات ومرطبانات',    'printed',   null, 'pantry',   17),
  ('pantry',     'food',    '🫒', 'Oil, spices and basics','زيت وبهارات وأساسيات', 'printed',   null, 'pantry',   18),
  ('drinks',     'food',    '🧃', 'Drinks',               'مشروبات',            'printed',   null, 'pantry',   19),
  ('snacks',     'food',    '🍪', 'Snacks and sweets',    'تسالي وحلويات',       'printed',   null, 'pantry',   20),
  ('cleaning',   null,      '🧽', 'Cleaning',             'تنظيف',              'none',      null, 'laundry',  30),
  ('laundry',    'cleaning','🧺', 'Laundry',              'غسيل',               null,        null, 'laundry',  31),
  ('dishes',     'cleaning','🍽', 'Dishes',               'جلي',                null,        null, 'other',    32),
  ('surfaces',   'cleaning','🧴', 'Floors and surfaces',  'أرضيات وأسطح',        null,        null, 'laundry',  33),
  ('care',       null,      '🧼', 'Personal care',        'عناية شخصية',         'none',      null, 'bathroom', 40),
  ('paper',      null,      '🧻', 'Paper and bags',       'ورق وأكياس',          'none',      null, 'other',    50),
  ('baby',       null,      '🍼', 'Baby',                 'أطفال رضّع',          'printed',   null, 'other',    60),
  ('other',      null,      '📦', 'Other',                'أخرى',               'none',      null, 'other',    90);

create temporary table seed_category_ids as
  select key, gen_random_uuid() as id from seed_categories;

insert into public.categories (id, parent_id, icon, name_en, name_ar, expiry_type, shelf_life_days, default_location_type, sort_order, status)
select ids.id, parent_ids.id, c.icon, c.name_en, c.name_ar, c.expiry_type, c.shelf_life_days, c.location, c.sort_order, 'approved'
  from seed_categories c
  join seed_category_ids ids on ids.key = c.key
  left join seed_category_ids parent_ids on parent_ids.key = c.parent_key
 order by c.parent_key nulls first;

create temporary table seed_items (
  category_key text,
  icon text,
  name_en text,
  name_ar text,
  tracking_mode text,
  unit_kind text,
  expiry_type text,
  shelf_life_days int
);

insert into seed_items values
  ('grains', '🍚', 'Long-grain rice',  'أرز طويل الحبة', 'level',   'weight', null, null),
  ('grains', '🍚', 'Short-grain rice', 'أرز قصير الحبة', 'level',   'weight', null, null),
  ('grains', '🍝', 'Pasta',            'معكرونة',       'counted', 'piece',  null, null),
  ('grains', '🌾', 'Bulgur',           'برغل',          'level',   'weight', null, null),
  ('grains', '🫘', 'Lentils',          'عدس',           'level',   'weight', null, null),
  ('grains', '🌾', 'Flour',            'طحين',          'level',   'weight', null, null),
  ('grains', '🧂', 'Sugar',            'سكر',           'level',   'weight', null, null),
  ('dairy',  '🥛', 'Milk',             'حليب',          'counted', 'volume', null, null),
  ('dairy',  '🥚', 'Eggs',             'بيض',           'counted', 'piece',  null, null),
  ('dairy',  '🧀', 'White cheese',     'جبنة بيضاء',    'counted', 'weight', null, null),
  ('dairy',  '🥣', 'Labneh',           'لبنة',          'counted', 'weight', null, null),
  ('dairy',  '🥣', 'Yogurt',           'لبن',           'counted', 'weight', null, null),
  ('dairy',  '🧈', 'Butter',           'زبدة',          'counted', 'weight', null, null),
  ('fruit',  '🍌', 'Bananas',          'موز',           'counted', 'weight', null, 5),
  ('fruit',  '🍎', 'Apples',           'تفاح',          'counted', 'weight', null, 14),
  ('fruit',  '🍊', 'Oranges',          'برتقال',        'counted', 'weight', null, 14),
  ('fruit',  '🍋', 'Lemons',           'ليمون',         'counted', 'weight', null, 14),
  ('vegetables', '🍅', 'Tomatoes',     'بندورة',        'counted', 'weight', null, 7),
  ('vegetables', '🥒', 'Cucumbers',    'خيار',          'counted', 'weight', null, 7),
  ('vegetables', '🥔', 'Potatoes',     'بطاطا',         'counted', 'weight', null, 30),
  ('vegetables', '🧅', 'Onions',       'بصل',           'counted', 'weight', null, 30),
  ('vegetables', '🧄', 'Garlic',       'ثوم',           'counted', 'weight', null, 30),
  ('vegetables', '🌿', 'Parsley',      'بقدونس',        'counted', 'piece',  null, 5),
  ('meat',   '🍗', 'Chicken',          'دجاج',          'counted', 'weight', null, null),
  ('meat',   '🥩', 'Minced meat',      'لحمة مفرومة',   'counted', 'weight', null, null),
  ('meat',   '🐟', 'Fish',             'سمك',           'counted', 'weight', null, null),
  ('bakery', '🫓', 'Arabic bread',     'خبز عربي',      'counted', 'piece',  null, 3),
  ('bakery', '🍞', 'Toast bread',      'خبز توست',      'counted', 'piece',  null, 5),
  ('canned', '🥫', 'Tuna',             'تونة',          'counted', 'piece',  null, null),
  ('canned', '🥫', 'Chickpeas',        'حمص حب',        'counted', 'piece',  null, null),
  ('canned', '🥫', 'Fava beans',       'فول',           'counted', 'piece',  null, null),
  ('canned', '🍅', 'Tomato paste',     'رب البندورة',   'counted', 'piece',  null, null),
  ('canned', '🍯', 'Tahini',           'طحينة',         'counted', 'piece',  null, null),
  ('pantry', '🫒', 'Olive oil',        'زيت زيتون',     'level',   'volume', null, null),
  ('pantry', '🌻', 'Vegetable oil',    'زيت نباتي',     'level',   'volume', null, null),
  ('pantry', '🧂', 'Salt',             'ملح',           'level',   'weight', 'none', null),
  ('pantry', '🌿', 'Za''atar',         'زعتر',          'level',   'weight', null, null),
  ('pantry', '🍵', 'Tea',              'شاي',           'level',   'weight', null, null),
  ('pantry', '☕', 'Coffee',           'قهوة',          'level',   'weight', null, null),
  ('drinks', '💧', 'Water',            'ماء',           'counted', 'volume', 'none', null),
  ('drinks', '🧃', 'Juice',            'عصير',          'counted', 'volume', null, null),
  ('laundry',  '🧺', 'Laundry detergent', 'مسحوق غسيل', 'level',   'weight', null, null),
  ('laundry',  '🧴', 'Fabric softener',   'منعّم ملابس', 'level',   'volume', null, null),
  ('dishes',   '🧽', 'Dish soap',         'سائل جلي',   'level',   'volume', null, null),
  ('dishes',   '🧽', 'Sponges',           'ليف جلي',    'counted', 'piece',  null, null),
  ('surfaces', '🧴', 'Floor cleaner',     'منظف أرضيات', 'level',  'volume', null, null),
  ('surfaces', '🧴', 'Bleach',            'كلور',       'level',   'volume', null, null),
  ('care',   '🧼', 'Soap',             'صابون',         'counted', 'piece',  null, null),
  ('care',   '🧴', 'Shampoo',          'شامبو',         'level',   'volume', null, null),
  ('care',   '🪥', 'Toothpaste',       'معجون أسنان',   'counted', 'piece',  null, null),
  ('paper',  '🧻', 'Toilet paper',     'ورق حمّام',     'counted', 'piece',  null, null),
  ('paper',  '🧻', 'Kitchen paper',    'محارم مطبخ',    'counted', 'piece',  null, null),
  ('paper',  '🛍️', 'Garbage bags',     'أكياس قمامة',   'counted', 'piece',  null, null),
  ('baby',   '👶', 'Diapers',          'حفاضات',        'counted', 'piece',  'none', null),
  ('baby',   '🍼', 'Baby formula',     'حليب أطفال',    'counted', 'piece',  null, null);

insert into public.items (category_id, icon, name_en, name_ar, tracking_mode, unit_kind, expiry_type, shelf_life_days, status)
select ids.id, i.icon, i.name_en, i.name_ar, i.tracking_mode, i.unit_kind, i.expiry_type, i.shelf_life_days, 'approved'
  from seed_items i
  join seed_category_ids ids on ids.key = i.category_key;

drop table seed_items;
drop table seed_category_ids;
drop table seed_categories;
