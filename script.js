document.getElementById('searchForm').addEventListener('submit', async function(event) {
    event.preventDefault();

    const location = document.getElementById('location').value;
    const checkInDateStr = document.getElementById('checkInDate').value;
    const checkOutDateStr = document.getElementById('checkOutDate').value;
    const adults = document.getElementById('adults').value;
    const numberOfRooms = document.getElementById('numberOfRooms').value;
    const email = document.getElementById('email').value;
    const limitResults = parseInt(document.getElementById('limitResults').value, 10);
    const formCurrency = document.getElementById('currency').value;
    const priceLimit = parseFloat(document.getElementById('priceLimit').value);

    // Convert strings to Date objects
    const checkInDate = new Date(checkInDateStr);
    const checkOutDate = new Date(checkOutDateStr);

    // Calculate number of nights
    const numberOfNights = Math.round((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    if (numberOfNights <= 0) {
        alert('Check-out date must be after check-in date.');
        return;
    }

    console.log('Form Data:', {
        location,
        checkInDate: checkInDateStr,
        checkOutDate: checkOutDateStr,
        adults,
        numberOfRooms,
        email,
        formCurrency,
        priceLimit
    });

    const getAccessTokenUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetAmadeusAccessToken?code=8-Ok9mpy3X22aWVQSXBs_djXz57bJvh23XJAPuY-yH9jAzFu8nDFaA%3D%3D';
    const getHotelsByCoordinatesUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetHotelsByCoordinates?code=_9_S3ATWEtYncsW6pzX2gKatTmRWbkHKc9O2GsD-74BqAzFupvm9kA%3D%3D';
    const getHotelOffersUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetHotelOffers?code=N5p8k9qzS_NgW_h2mHWm_xKOpPHY2Cjb_nh_TCturrA5AzFuCXBy-g%3D%3D';
    const getCoordinatesByLocationUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetCoordinatesByLocation?code=tyHMhU1QpcgHHWUrwfor8PtyYEzW-keeu2daJnRQqdQxAzFuPgYxzA%3D%3D';
    const sheetyUrl = 'https://hotelfunctionapp.azurewebsites.net/api/SendDataToSheety?code=WB185Wd0xWtqP1DMGlKF1WnHLt8TXwpm8QXDzTlulg6FAzFuFvQ-2A%3D%3D';
    const conversionApiUrl = 'https://v6.exchangerate-api.com/v6/0fdee0a5645b6916b5a20bb3/latest/';

    let accessToken;
    let internalHotelIds = [];
    let locationCoordinates;
    let selectedHotels = [];

    async function convertCurrency(amount, fromCurrency, toCurrency) {
        const url = `${conversionApiUrl}${fromCurrency}`;
        const response = await fetch(url);
        const data = await response.json();
        const rate = data.conversion_rates[toCurrency];
        if (!rate) {
            throw new Error(`No conversion rate available for ${toCurrency}`);
        }
        return amount * rate;
    }

    async function getLocationCoordinates(location) {
        const apiUrl = `${getCoordinatesByLocationUrl}&location=${encodeURIComponent(location)}`;
        console.log('Coordinates URL:', apiUrl);
        const response = await fetch(apiUrl);
        const text = await response.text();
        try {
            const data = JSON.parse(text);
            console.log('Coordinates Data:', data);
            locationCoordinates = data;
            return data;
        } catch (err) {
            throw new Error(`Response is not valid JSON: ${text}`);
        }
    }

    async function fetchHotelOffers(validHotelIds) {
        const limitedHotelIds = validHotelIds.slice(0, limitResults);
        const params = `hotelIds=${limitedHotelIds.join(',')}&adults=${adults}&checkInDate=${checkInDateStr}&checkOutDate=${checkOutDateStr}&roomQuantity=${numberOfRooms}&paymentPolicy=NONE&bestRateOnly=true&includeClosed=false`;
        const url = `${getHotelOffersUrl}&params=${encodeURIComponent(params)}`;
        console.log('Fetching hotel offers with params:', params);
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        const text = await response.text();
        try {
            const responseData = JSON.parse(text);
            console.log('Hotel offers response:', responseData);
            if (responseData.errors) {
                const errorDetails = responseData.errors.map(err => `Code: ${err.code}, Detail: ${err.detail}`).join('; ');
                throw new Error(`Failed to fetch hotel offers: ${errorDetails}`);
            }
            return responseData;
        } catch (err) {
            throw new Error(`Failed to parse hotel offers response: ${text}`);
        }
    }

    async function convertPricesToFormCurrency(hotelOffers, originalCurrency) {
        return Promise.all(hotelOffers.map(async offer => {
            const price = parseFloat(offer.offers[0].price.total);
            if (originalCurrency !== formCurrency) {
                const convertedPrice = await convertCurrency(price, originalCurrency, formCurrency);
                offer.offers[0].price.total = convertedPrice.toFixed(2);
                offer.offers[0].price.currency = formCurrency;
            }
            return offer;
        }));
    }

    function filterOffersByPrice(hotelOffers, priceLimit, numberOfNights) {
        console.log('Filtering offers by price. Price Limit:', priceLimit, 'Number of Nights:', numberOfNights);
        
        return hotelOffers.map(offer => {
            const totalPrice = parseFloat(offer.offers[0].price.total);
            const pricePerNight = totalPrice / numberOfNights;
    
            console.log('Offer ID:', offer.hotel.hotelId, 'Total Price:', totalPrice, 'Price Per Night:', pricePerNight);
    
            return {
                ...offer,
                pricePerNight: pricePerNight.toFixed(2)
            };
        }).filter(offer => {
            return parseFloat(offer.pricePerNight) <= priceLimit;
        });
    }
    
    

    async function submitToSheety(formData, formattedData) {
        const data = {
            ...formData,
            ...formattedData
        };
        const response = await fetch(sheetyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        console.log('Sheety response:', result);
        return result;
    }

    function handleCheckboxChange() {
        const checkboxes = document.querySelectorAll('#results tbody input[type="checkbox"]');
        const checkedCheckboxes = Array.from(checkboxes).filter(checkbox => checkbox.checked);

        if (checkedCheckboxes.length > 3) {
            alert('You can only select up to 3 hotels.');
            this.checked = false; // Uncheck the box if the limit is exceeded
        } else {
            selectedHotels = checkedCheckboxes.map(checkbox => {
                const row = checkbox.closest('tr');
                return {
                    hotel: row.querySelector('.hotel').textContent,
                    hotelId: row.querySelector('.hiddenHotelId').textContent,
                    roomType: row.querySelector('.roomType').textContent,
                    price: row.querySelector('.price').textContent
                };
            });
        }
    }

    function formatHotelName(name) {
        return name
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    function formatRoomType(roomType) {
        return roomType
            .toUpperCase()
            .replace(/_/g, ' ')
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius of the Earth in km
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        return distance.toFixed(2); // Distance in km
    }

    document.getElementById('submitToSheet').addEventListener('click', async function() {
        const formData = {
            location,
            checkInDate: checkInDateStr,
            checkOutDate: checkOutDateStr,
            adults,
            numberOfRooms,
            email,
            currency: formCurrency,
            priceLimit
        };

        const formattedData = {
            selectedHotels
        };

        try {
            const result = await submitToSheety(formData, formattedData);
            if (result) {
                alert('Data successfully sent to Sheety.');
            }
        } catch (error) {
            console.error('Error sending data to Sheety:', error.message);
        }
    });

    document.querySelectorAll('#results input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', handleCheckboxChange);
    });

    try {
        const tokenResponse = await fetch(getAccessTokenUrl);
        const tokenData = await tokenResponse.json();
        accessToken = tokenData.access_token;

        const coords = await getLocationCoordinates(location);
        if (!coords || !coords.latitude || !coords.longitude) {
            throw new Error('Invalid coordinates received');
        }
        const { latitude, longitude } = coords;
        const getHotelsByCoordinatesUrlWithParams = `${getHotelsByCoordinatesUrl}&latitude=${latitude}&longitude=${longitude}&radius=5&radiusUnit=KM&hotelSource=ALL`;

        const hotelsResponse = await fetch(getHotelsByCoordinatesUrlWithParams, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        const hotelsData = await hotelsResponse.json();

        const resultsTableBody = document.querySelector('#results tbody');
        resultsTableBody.innerHTML = '';

        if (hotelsData && hotelsData.data && hotelsData.data.length > 0) {
            internalHotelIds = hotelsData.data.map(hotel => hotel.hotelId);
            const hotelIds = internalHotelIds.slice(0, limitResults);

            const offersData = await fetchHotelOffers(hotelIds);
            const originalCurrency = offersData.data[0]?.offers[0]?.price?.currency || formCurrency;
            const convertedOffers = await convertPricesToFormCurrency(offersData.data, originalCurrency);
            const filteredOffers = filterOffersByPrice(convertedOffers, priceLimit, numberOfNights);

            if (filteredOffers.length > 0) {
                filteredOffers.forEach(offer => {
                    const row = document.createElement('tr');
            
                    const hiddenIdCell = document.createElement('td');
                    hiddenIdCell.className = 'hiddenHotelId';
                    hiddenIdCell.textContent = offer.hotel.hotelId;
                    hiddenIdCell.style.display = 'none';
                    row.appendChild(hiddenIdCell);
            
                    const checkboxCell = document.createElement('td');
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'select-checkbox';
                    checkboxCell.appendChild(checkbox);
                    row.appendChild(checkboxCell);
            
                    const nameCell = document.createElement('td');
                    nameCell.textContent = formatHotelName(offer.hotel.name) || 'N/A';
                    nameCell.className = 'hotel';
                    row.appendChild(nameCell);
            
                    const roomTypeCell = document.createElement('td');
                    const roomType = offer.offers[0].room ? formatRoomType(offer.offers[0].room.typeEstimated.category) : 'N/A';
                    roomTypeCell.textContent = roomType;
                    roomTypeCell.className = 'roomType';
                    row.appendChild(roomTypeCell);
            
                    const pricePerNightCell = document.createElement('td');
                    const pricePerNight = offer.pricePerNight ? `${offer.offers[0].price.currency} ${offer.pricePerNight}` : 'N/A';
                    pricePerNightCell.textContent = pricePerNight;
                    pricePerNightCell.className = 'pricePerNight';
                    row.appendChild(pricePerNightCell);

                    const priceCell = document.createElement('td');
                    const price = offer.offers[0].price ? `${offer.offers[0].price.currency} ${offer.offers[0].price.total}` : 'N/A';
                    priceCell.textContent = price;
                    priceCell.className = 'price';
                    row.appendChild(priceCell);
            
                    const distanceCell = document.createElement('td');
                    const hotelLat = offer.hotel.latitude;
                    const hotelLon = offer.hotel.longitude;
                    const distance = calculateDistance(locationCoordinates.latitude, locationCoordinates.longitude, hotelLat, hotelLon);
                    distanceCell.textContent = `${distance} km`;
                    row.appendChild(distanceCell);
            
                    resultsTableBody.appendChild(row);
                });
            } else {
                resultsTableBody.innerHTML = '<tr><td colspan="6">No results found</td></tr>';
            }
            

            document.getElementById('resultsBox').style.display = 'block';
        } else {
            document.getElementById('resultsBox').style.display = 'block';
            resultsTableBody.innerHTML = '<tr><td colspan="5">No hotels found</td></tr>';
        }
    } catch (error) {
        console.error('Error:', error.message);
        document.getElementById('resultsBox').style.display = 'block';
        document.querySelector('#results tbody').innerHTML = `<tr><td colspan="5">An error occurred: ${error.message}. Please try again.</td></tr>`;
    }
});
